//! Bounded native export writes, scoped to the window that chose the destination.
use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::{self, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_CHUNK_BYTES: usize = 65_536;
const MAX_ACTIVE_EXPORTS: usize = 4;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

struct PendingExport {
    owner: String,
    target: PathBuf,
    temporary: PathBuf,
    preference: Option<PathBuf>,
    file: Option<File>,
    next_sequence: u64,
    cancelled: Arc<AtomicBool>,
    generation: Arc<AtomicBool>,
}

impl Drop for PendingExport {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        // Windows cannot remove an open file. Always close it first.
        self.file.take();
        let _ = std::fs::remove_file(&self.temporary);
    }
}

#[derive(Default)]
pub struct ExportStreams {
    pending: Mutex<HashMap<String, PendingExport>>,
    generations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    choosers: Mutex<HashSet<String>>,
    closed_windows: Mutex<HashSet<String>>,
    stopped: AtomicBool,
    shutdown_finished: AtomicBool,
}

pub struct CommittedExport {
    pub target: PathBuf,
    pub preference: Option<PathBuf>,
}

pub struct ExportCancellation {
    operation: Arc<AtomicBool>,
    generation: Arc<AtomicBool>,
}

pub struct ExportChooser {
    state: Arc<ExportStreams>,
    owner: String,
}

impl Drop for ExportChooser {
    fn drop(&mut self) {
        self.state
            .choosers
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&self.owner);
    }
}

impl ExportCancellation {
    pub fn is_cancelled(&self) -> bool {
        self.operation.load(Ordering::Acquire) || self.generation.load(Ordering::Acquire)
    }
}

impl ExportStreams {
    pub fn claim_chooser(self: &Arc<Self>, owner: &str) -> io::Result<ExportChooser> {
        let mut choosers = self
            .choosers
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if self.window_closed(owner) {
            return Err(invalid("The export window has closed"));
        }
        if !choosers.insert(owner.to_owned()) {
            return Err(invalid(
                "Finish or cancel the open save dialog before starting another export.",
            ));
        }
        Ok(ExportChooser {
            state: self.clone(),
            owner: owner.to_owned(),
        })
    }
    pub fn current_generation(&self, owner: &str) -> Arc<AtomicBool> {
        self.generations
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .entry(owner.to_owned())
            .or_insert_with(|| Arc::new(AtomicBool::new(false)))
            .clone()
    }

    /// Invalidate the old page immediately, without waiting for disk I/O.
    pub fn navigation_started(&self, owner: &str) -> Arc<AtomicBool> {
        let mut generations = self
            .generations
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let previous = generations
            .insert(owner.to_owned(), Arc::new(AtomicBool::new(false)))
            .unwrap_or_else(|| Arc::new(AtomicBool::new(false)));
        previous.store(true, Ordering::Release);
        previous
    }

    /// A delayed cleanup must not cancel exports started by the replacement page.
    pub fn abort_generation(&self, owner: &str, generation: &Arc<AtomicBool>) {
        self.pending
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .retain(|_, export| {
                export.owner != owner || !Arc::ptr_eq(&export.generation, generation)
            });
    }

    #[cfg(test)]
    pub fn begin(
        &self,
        owner: String,
        target: PathBuf,
        preference: Option<PathBuf>,
    ) -> io::Result<String> {
        let generation = self.current_generation(&owner);
        self.begin_for_generation(owner, target, preference, generation)
    }

    pub fn begin_for_generation(
        &self,
        owner: String,
        target: PathBuf,
        preference: Option<PathBuf>,
        generation: Arc<AtomicBool>,
    ) -> io::Result<String> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| invalid("Export state is unavailable"))?;
        if self.stopped.load(Ordering::Acquire)
            || self
                .closed_windows
                .lock()
                .map_err(|_| invalid("Export state is unavailable"))?
                .contains(&owner)
        {
            return Err(invalid("The export window has closed"));
        }
        if pending.len() >= MAX_ACTIVE_EXPORTS {
            return Err(invalid(
                "Finish or cancel an active export before starting another",
            ));
        }
        if generation.load(Ordering::Acquire) {
            return Err(invalid("The export page changed. Retry the export."));
        }
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let id = format!(
            "{}-{nonce}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed)
        );
        let temporary = target
            .parent()
            .ok_or_else(|| invalid("Missing destination directory"))?
            .join(format!(".hict-save-{id}.tmp"));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options.open(&temporary)?;
        let export = PendingExport {
            owner,
            target,
            temporary,
            preference,
            file: Some(file),
            next_sequence: 0,
            cancelled: Arc::new(AtomicBool::new(false)),
            generation,
        };
        if let Ok(metadata) = std::fs::metadata(&export.target) {
            export
                .file
                .as_ref()
                .unwrap()
                .set_permissions(metadata.permissions())?;
        }
        if export.generation.load(Ordering::Acquire) {
            return Err(invalid("The export page changed. Retry the export."));
        }
        pending.insert(id.clone(), export);
        Ok(id)
    }

    /// Older WebUI clients still send one byte array. Keep their filesystem
    /// work under the same ownership, navigation and shutdown guards.
    pub fn save_legacy_export(
        &self,
        owner: String,
        target: PathBuf,
        preference: Option<PathBuf>,
        generation: Arc<AtomicBool>,
        bytes: &[u8],
    ) -> io::Result<CommittedExport> {
        let id = self.begin_for_generation(owner.clone(), target, preference, generation)?;
        let result = (|| {
            for (sequence, chunk) in bytes.chunks(MAX_CHUNK_BYTES).enumerate() {
                self.write(&owner, &id, sequence as u64, chunk)?;
            }
            self.finish_with_length(&owner, &id, Some(bytes.len() as u64))
        })();
        if result.is_err() {
            let _ = self.abort(&owner, &id);
        }
        result
    }

    pub fn cancellation(&self, owner: &str, id: &str) -> io::Result<ExportCancellation> {
        let pending = self
            .pending
            .lock()
            .map_err(|_| invalid("Export state is unavailable"))?;
        let export = pending
            .get(id)
            .ok_or_else(|| invalid("This export is no longer active"))?;
        if export.owner != owner {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "This export belongs to another window",
            ));
        }
        Ok(ExportCancellation {
            operation: export.cancelled.clone(),
            generation: export.generation.clone(),
        })
    }

    pub fn write(&self, owner: &str, id: &str, sequence: u64, bytes: &[u8]) -> io::Result<()> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| invalid("Export state is unavailable"))?;
        let export = pending
            .get_mut(id)
            .ok_or_else(|| invalid("This export is no longer active"))?;
        if export.owner != owner {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "This export belongs to another window",
            ));
        }
        let result = (|| {
            if export.generation.load(Ordering::Acquire) {
                return Err(invalid("The export page changed. Retry the export."));
            }
            if bytes.len() > MAX_CHUNK_BYTES {
                return Err(invalid("Export chunk exceeds the transfer limit"));
            }
            if sequence != export.next_sequence {
                return Err(invalid("Export chunks arrived out of order"));
            }
            let next = sequence
                .checked_add(1)
                .ok_or_else(|| invalid("Too many export chunks"))?;
            export
                .file
                .as_mut()
                .ok_or_else(|| invalid("Export file is closed"))?
                .write_all(bytes)?;
            export.next_sequence = next;
            Ok(())
        })();
        if result.is_err() {
            pending.remove(id);
        }
        result
    }

    pub fn finish(&self, owner: &str, id: &str) -> io::Result<CommittedExport> {
        self.finish_with_length(owner, id, None)
    }

    pub fn finish_with_length(
        &self,
        owner: &str,
        id: &str,
        expected_bytes: Option<u64>,
    ) -> io::Result<CommittedExport> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| invalid("Export state is unavailable"))?;
        let export = pending
            .get_mut(id)
            .ok_or_else(|| invalid("This export is no longer active"))?;
        if export.owner != owner {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "This export belongs to another window",
            ));
        }
        // Keep the transfer registered through commit so shutdown waits for a
        // complete replacement and the active-transfer limit includes fsync.
        let result = (|| {
            if export.generation.load(Ordering::Acquire) {
                return Err(invalid("The export page changed. Retry the export."));
            }
            let file = export
                .file
                .take()
                .ok_or_else(|| invalid("Export file is closed"))?;
            if let Some(length) = expected_bytes {
                if file.metadata()?.len() != length {
                    return Err(invalid("The export file is incomplete"));
                }
            }
            file.sync_all()?;
            drop(file);
            if export.generation.load(Ordering::Acquire) {
                return Err(invalid("The export page changed. Retry the export."));
            }
            std::fs::rename(&export.temporary, &export.target)?;
            Ok(CommittedExport {
                target: export.target.clone(),
                preference: export.preference.clone(),
            })
        })();
        pending.remove(id);
        result
    }

    pub fn abort(&self, owner: &str, id: &str) -> io::Result<()> {
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| invalid("Export state is unavailable"))?;
        if let Some(export) = pending.get(id) {
            if export.owner != owner {
                return Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "This export belongs to another window",
                ));
            }
        }
        pending.remove(id);
        Ok(())
    }

    pub fn abort_window(&self, owner: &str) {
        self.current_generation(owner)
            .store(true, Ordering::Release);
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        self.closed_windows
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .insert(owner.to_owned());
        pending.retain(|_, export| export.owner != owner);
    }

    pub fn abort_all(&self) {
        self.pending
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clear();
    }

    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::Release);
        for generation in self
            .generations
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .values()
        {
            generation.store(true, Ordering::Release);
        }
        self.abort_all();
        self.shutdown_finished.store(true, Ordering::Release);
    }

    pub fn shutdown_complete(&self) -> bool {
        self.shutdown_finished.load(Ordering::Acquire)
    }

    pub fn window_closed(&self, owner: &str) -> bool {
        self.stopped.load(Ordering::Acquire)
            || self
                .closed_windows
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .contains(owner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "hict-stream-test-{}-{nonce}",
                NEXT_ID.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn assert_no_staging(&self) {
            assert!(!std::fs::read_dir(&self.0).unwrap().any(|entry| entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".hict-save-")));
        }
    }
    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn replaces_only_after_all_ordered_chunks_are_committed() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("assembly.fa");
        std::fs::write(&target, b"previous").unwrap();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        let chunk: Vec<u8> = (0..MAX_CHUNK_BYTES).map(|i| (i % 251) as u8).collect();
        for sequence in 0..192 {
            state.write("main", &id, sequence, &chunk).unwrap();
        }
        assert_eq!(std::fs::read(&target).unwrap(), b"previous");
        let committed = state.finish("main", &id).unwrap();
        assert_eq!(committed.target, target);
        let actual = std::fs::read(&target).unwrap();
        assert_eq!(actual.len(), chunk.len() * 192);
        for block in actual.chunks(chunk.len()) {
            assert_eq!(block, chunk);
        }
        assert!(state.finish("main", &id).is_err());
        dir.assert_no_staging();
    }

    #[test]
    fn cancellation_and_wrong_order_preserve_previous_file() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("old.fa");
        std::fs::write(&target, b"keep").unwrap();
        for cancel in [true, false] {
            let id = state.begin("main".into(), target.clone(), None).unwrap();
            state.write("main", &id, 0, b"partial").unwrap();
            if cancel {
                state.abort("main", &id).unwrap();
                state.abort("main", &id).unwrap();
            } else {
                assert!(state.write("main", &id, 0, b"duplicate").is_err());
            }
            assert!(state.finish("main", &id).is_err());
            assert_eq!(std::fs::read(&target).unwrap(), b"keep");
            dir.assert_no_staging();
        }
    }

    #[test]
    fn expected_byte_count_and_cancellation_remain_owned_until_commit() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("owned.fa");
        std::fs::write(&target, b"keep").unwrap();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        assert!(state.cancellation("other", &id).is_err());
        let cancelled = state.cancellation("main", &id).unwrap();
        state.write("main", &id, 0, b"ACGT").unwrap();
        assert!(state.finish_with_length("main", &id, Some(5)).is_err());
        assert!(cancelled.is_cancelled());
        assert_eq!(std::fs::read(&target).unwrap(), b"keep");
        dir.assert_no_staging();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        state.write("main", &id, 0, b"ACGT").unwrap();
        state.finish_with_length("main", &id, Some(4)).unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"ACGT");
        dir.assert_no_staging();
    }

    #[test]
    fn other_windows_cannot_write_finish_or_cancel() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("owned.fa");
        let id = state.begin("first".into(), target.clone(), None).unwrap();
        assert!(state.write("second", &id, 0, b"bad").is_err());
        assert!(state.finish("second", &id).is_err());
        assert!(state.abort("second", &id).is_err());
        state.abort_window("second");
        state.write("first", &id, 0, b"correct").unwrap();
        state.finish("first", &id).unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"correct");
        dir.assert_no_staging();
    }

    #[test]
    fn oversized_chunk_is_rejected_and_cleaned() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("large.fa");
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        assert!(state
            .write("main", &id, 0, &vec![0; MAX_CHUNK_BYTES + 1])
            .is_err());
        assert!(!target.exists());
        assert!(state.finish("main", &id).is_err());
        dir.assert_no_staging();
    }

    #[test]
    fn disk_write_failure_discards_staging_and_keeps_existing_data() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("old.fa");
        std::fs::write(&target, b"keep").unwrap();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        // A real read-only descriptor makes the OS reject the next disk write.
        state.pending.lock().unwrap().get_mut(&id).unwrap().file =
            Some(File::open(&target).unwrap());
        assert!(state.write("main", &id, 0, b"partial").is_err());
        assert!(state.finish("main", &id).is_err());
        assert_eq!(std::fs::read(target).unwrap(), b"keep");
        dir.assert_no_staging();
    }

    #[test]
    fn failed_rename_and_window_disposal_clean_temporary_files() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("directory");
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        state.write("main", &id, 0, b"data").unwrap();
        // Create the obstruction after opening a valid file destination.
        // Windows rejects copying a directory's permissions onto a file, so
        // starting with a directory never exercised the intended rename failure.
        std::fs::create_dir(&target).unwrap();
        assert!(state.finish("main", &id).is_err());
        assert!(target.is_dir());
        dir.assert_no_staging();
        let id = state
            .begin("main".into(), dir.0.join("cancel.fa"), None)
            .unwrap();
        state.write("main", &id, 0, b"partial").unwrap();
        state.abort_window("main");
        assert!(state.finish("main", &id).is_err());
        dir.assert_no_staging();
        assert!(state.window_closed("main"));
        assert!(!state.window_closed("other"));
        assert!(state
            .begin("main".into(), dir.0.join("late.fa"), None)
            .is_err());
    }

    #[test]
    fn empty_files_and_remembered_destination_are_committed() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("empty.fa");
        let preference = dir.0.join("last-fasta-directory.txt");
        let id = state
            .begin("main".into(), target.clone(), Some(preference.clone()))
            .unwrap();
        let committed = state.finish("main", &id).unwrap();
        assert_eq!(committed.preference, Some(preference.clone()));
        assert_eq!(std::fs::metadata(target).unwrap().len(), 0);
        assert!(!preference.exists());
        dir.assert_no_staging();
    }

    #[test]
    fn active_transfer_limit_is_released_after_abort_and_drop_cleans_files() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let first = state
            .begin("main".into(), dir.0.join("0.fa"), None)
            .unwrap();
        for i in 1..MAX_ACTIVE_EXPORTS {
            state
                .begin("main".into(), dir.0.join(format!("{i}.fa")), None)
                .unwrap();
        }
        assert!(state
            .begin("main".into(), dir.0.join("overflow.fa"), None)
            .is_err());
        state.abort("main", &first).unwrap();
        state
            .begin("main".into(), dir.0.join("new.fa"), None)
            .unwrap();
        state.abort_all();
        dir.assert_no_staging();
        state
            .begin("main".into(), dir.0.join("drop.fa"), None)
            .unwrap();
        drop(state);
        dir.assert_no_staging();
    }

    #[test]
    fn shutdown_revokes_pending_and_late_dialog_completions() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        assert!(!state.shutdown_complete());
        state
            .begin("main".into(), dir.0.join("pending.fa"), None)
            .unwrap();
        state.shutdown();
        assert!(state.shutdown_complete());
        dir.assert_no_staging();
        assert!(state.window_closed("another"));
        assert!(state
            .begin("another".into(), dir.0.join("late.fa"), None)
            .is_err());
        dir.assert_no_staging();
    }

    #[test]
    fn navigation_revokes_only_its_page_without_waiting_for_disk_writes() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let first = state
            .begin("main".into(), dir.0.join("old.fa"), None)
            .unwrap();
        let other = state
            .begin("other".into(), dir.0.join("other.fa"), None)
            .unwrap();
        let cancelled = state.cancellation("main", &first).unwrap();
        let unaffected = state.cancellation("other", &other).unwrap();
        // The UI navigation callback cannot wait on a disk worker holding this lock.
        let disk_write = state.pending.lock().unwrap();
        let previous = state.navigation_started("main");
        assert!(cancelled.is_cancelled());
        assert!(!unaffected.is_cancelled());
        drop(disk_write);
        state.abort_generation("main", &previous);
        assert!(state.cancellation("main", &first).is_err());
        state.write("other", &other, 0, b"retained").unwrap();
        state.finish("other", &other).unwrap();
        assert_eq!(std::fs::read(dir.0.join("other.fa")).unwrap(), b"retained");
        dir.assert_no_staging();
    }

    #[test]
    fn navigation_rejects_an_old_chooser_answer_before_creating_a_file() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("old.fa");
        std::fs::write(&target, b"original").unwrap();
        let chooser_page = state.current_generation("main");
        state.navigation_started("main");
        assert!(state
            .begin_for_generation("main".into(), target.clone(), None, chooser_page)
            .is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"original");
        dir.assert_no_staging();
        let current = state.begin("main".into(), target.clone(), None).unwrap();
        state
            .write("main", &current, 0, b"replacement page")
            .unwrap();
        state.finish("main", &current).unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"replacement page");
        dir.assert_no_staging();
    }

    #[test]
    fn delayed_navigation_cleanup_cannot_remove_new_page_exports() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        state
            .begin("main".into(), dir.0.join("first.fa"), None)
            .unwrap();
        let first_page = state.navigation_started("main");
        state
            .begin("main".into(), dir.0.join("second.fa"), None)
            .unwrap();
        let second_page = state.navigation_started("main");
        let current = state
            .begin("main".into(), dir.0.join("current.fa"), None)
            .unwrap();
        // Cleanup workers may complete in the reverse order of navigation.
        state.abort_generation("main", &second_page);
        state.abort_generation("main", &first_page);
        assert_eq!(state.pending.lock().unwrap().len(), 1);
        state.write("main", &current, 0, b"current").unwrap();
        state.finish("main", &current).unwrap();
        assert_eq!(std::fs::read(dir.0.join("current.fa")).unwrap(), b"current");
        dir.assert_no_staging();
    }

    #[test]
    fn a_replaced_page_cannot_commit_its_partial_file() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("destination.fa");
        std::fs::write(&target, b"original").unwrap();
        let old = state.begin("main".into(), target.clone(), None).unwrap();
        state.write("main", &old, 0, b"partial").unwrap();
        state.navigation_started("main");
        assert!(state.finish("main", &old).is_err());
        assert_eq!(std::fs::read(target).unwrap(), b"original");
        dir.assert_no_staging();
    }

    #[test]
    fn legacy_saves_share_exact_byte_commit_and_page_ownership_guards() {
        let dir = Directory::new();
        let state = ExportStreams::default();
        let target = dir.0.join("legacy.bin");
        let expected: Vec<u8> = (0..2 * MAX_CHUNK_BYTES + 7)
            .map(|i| (i % 251) as u8)
            .collect();
        state
            .save_legacy_export(
                "main".into(),
                target.clone(),
                None,
                state.current_generation("main"),
                &expected,
            )
            .unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), expected);
        let old_page = state.current_generation("main");
        state.navigation_started("main");
        assert!(state
            .save_legacy_export(
                "main".into(),
                target.clone(),
                None,
                old_page,
                b"stale chooser"
            )
            .is_err());
        assert_eq!(std::fs::read(&target).unwrap(), expected);
        state
            .save_legacy_export(
                "main".into(),
                target.clone(),
                None,
                state.current_generation("main"),
                b"current page",
            )
            .unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"current page");
        dir.assert_no_staging();
    }

    #[test]
    fn an_interrupted_ipc_retry_cannot_open_a_second_chooser() {
        let state = Arc::new(ExportStreams::default());
        let original = state.claim_chooser("main").unwrap();
        let other_window = state.claim_chooser("other").unwrap();
        state.navigation_started("main");
        assert!(state.claim_chooser("main").is_err());
        drop(original);
        let replacement_page = state.claim_chooser("main").unwrap();
        drop(replacement_page);
        drop(other_window);
        state.shutdown();
        assert!(state.claim_chooser("main").is_err());
    }
}
