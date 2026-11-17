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
    closed_windows: Mutex<HashSet<String>>,
    stopped: AtomicBool,
    shutdown_finished: AtomicBool,
}

pub struct CommittedExport {
    pub target: PathBuf,
    pub preference: Option<PathBuf>,
}

impl ExportStreams {
    pub fn begin(
        &self,
        owner: String,
        target: PathBuf,
        preference: Option<PathBuf>,
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
        };
        if let Ok(metadata) = std::fs::metadata(&export.target) {
            export
                .file
                .as_ref()
                .unwrap()
                .set_permissions(metadata.permissions())?;
        }
        pending.insert(id.clone(), export);
        Ok(id)
    }

    pub fn cancellation(&self, owner: &str, id: &str) -> io::Result<Arc<AtomicBool>> {
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
        Ok(export.cancelled.clone())
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
        assert!(cancelled.load(Ordering::Acquire));
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
        std::fs::create_dir(&target).unwrap();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        state.write("main", &id, 0, b"data").unwrap();
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
}
