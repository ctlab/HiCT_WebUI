//! Coordinate downloads never carry sequence bytes through the WebView.
use crate::export_stream::{ExportCancellation, ExportStreams, MAX_CHUNK_BYTES};
use reqwest::header::{
    HeaderMap, HeaderValue, ACCEPT, ACCEPT_ENCODING, CONTENT_ENCODING, CONTENT_TYPE,
};
use serde::Deserialize;
use std::{collections::HashMap, future::Future, io, sync::Arc, time::Duration};
use url::Url;

#[derive(Deserialize)]
pub struct CoordinateRequest {
    pub url: String,
    pub body: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

fn validate(request: &CoordinateRequest) -> Result<(Url, HeaderMap), String> {
    if request.url.len() > 4096 || request.body.len() > 65_536 {
        return Err("Invalid export request.".into());
    }
    let url = Url::parse(&request.url).map_err(|_| "Invalid export address.")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.host_str().is_some_and(crate::is_allowed_hict_host)
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || ![
            "/get_fasta_for_assembly",
            "/get_fasta_for_selection",
            "/get_agp_for_assembly",
        ]
        .iter()
        .any(|suffix| url.path().ends_with(suffix))
    {
        return Err("Unsupported HiCT export address.".into());
    }
    let body: serde_json::Value =
        serde_json::from_str(&request.body).map_err(|_| "Invalid export request.")?;
    if !body.is_object() {
        return Err("Invalid export request.".into());
    }
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("text/plain"));
    headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("identity"));
    for (name, value) in &request.headers {
        let canonical = if name.eq_ignore_ascii_case("X-HiCT-History-Session") {
            "x-hict-history-session"
        } else if name.eq_ignore_ascii_case("X-HiCT-History-Revision") {
            "x-hict-history-revision"
        } else {
            continue;
        };
        if value.len() > 200 || value.contains(['\r', '\n']) || headers.contains_key(canonical) {
            return Err("Invalid export revision.".into());
        }
        headers.insert(
            canonical,
            HeaderValue::from_str(value).map_err(|_| "Invalid export revision.")?,
        );
    }
    Ok((url, headers))
}

async fn cancellable<F: Future>(
    cancelled: &ExportCancellation,
    future: F,
) -> Result<F::Output, String> {
    let mut future = Box::pin(future);
    loop {
        if cancelled.is_cancelled() {
            return Err("Export cancelled.".into());
        }
        match tokio::time::timeout(Duration::from_millis(100), future.as_mut()).await {
            Ok(value) => return Ok(value),
            Err(_) => continue,
        }
    }
}

fn disk_error(error: io::Error) -> String {
    match error.kind() {
        io::ErrorKind::StorageFull | io::ErrorKind::QuotaExceeded => {
            "Not enough storage space to save the export. Free space or choose another folder."
                .into()
        }
        io::ErrorKind::PermissionDenied | io::ErrorKind::ReadOnlyFilesystem => {
            "Cannot save the export in this folder. Choose a writable folder.".into()
        }
        _ => format!("The export could not be saved: {error}"),
    }
}

pub async fn download(
    streams: Arc<ExportStreams>,
    owner: String,
    id: String,
    request: CoordinateRequest,
) -> Result<(std::path::PathBuf, Option<std::path::PathBuf>), String> {
    let result = transfer(streams.clone(), &owner, &id, request).await;
    if result.is_err() {
        let _ = tauri::async_runtime::spawn_blocking(move || streams.abort(&owner, &id)).await;
    }
    result
}

async fn transfer(
    streams: Arc<ExportStreams>,
    owner: &str,
    id: &str,
    request: CoordinateRequest,
) -> Result<(std::path::PathBuf, Option<std::path::PathBuf>), String> {
    let (url, headers) = validate(&request)?;
    let cancelled = streams.cancellation(owner, id).map_err(disk_error)?;
    let client = reqwest::Client::builder()
        .tls_backend_native()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .referer(false)
        .http1_only()
        .connect_timeout(Duration::from_secs(10))
        // Match the existing desktop adapter's idle timeout while the JVM
        // prepares its temporary FASTA before sending response headers.
        .read_timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "The native export connection could not be initialized.")?;
    let send = client.post(url).headers(headers).body(request.body).send();
    let mut response = cancellable(&cancelled, send)
        .await?
        .map_err(|error| format!("The export connection failed: {error}"))?;
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or("")
        .trim();
    if !response.status().is_success()
        || !(content_type.eq_ignore_ascii_case("text/plain")
            || content_type.eq_ignore_ascii_case("application/octet-stream"))
    {
        return Err(if response.status() == reqwest::StatusCode::CONFLICT {
            "The displayed assembly changed. Refresh the map and export again.".into()
        } else {
            format!(
                "The server did not return an assembly file (HTTP {}). No file was saved.",
                response.status().as_u16()
            )
        });
    }
    let expected_bytes = response.content_length();
    if response
        .headers()
        .get(CONTENT_ENCODING)
        .is_some_and(|value| {
            !value.as_bytes().is_empty() && !value.as_bytes().eq_ignore_ascii_case(b"identity")
        })
    {
        return Err(
            "The server returned an unsupported compressed export. No file was saved.".into(),
        );
    }
    let mut received = 0u64;
    let mut sequence = 0u64;
    loop {
        let chunk = cancellable(&cancelled, response.chunk())
            .await?
            .map_err(|error| format!("The export connection was interrupted: {error}"))?;
        let Some(chunk) = chunk else {
            break;
        };
        received = received
            .checked_add(chunk.len() as u64)
            .ok_or("The export is too large.")?;
        for bytes in chunk.chunks(MAX_CHUNK_BYTES) {
            if cancelled.is_cancelled() {
                return Err("Export cancelled.".into());
            }
            let state = streams.clone();
            let window = owner.to_owned();
            let operation = id.to_owned();
            let data = bytes.to_vec();
            tauri::async_runtime::spawn_blocking(move || {
                state.write(&window, &operation, sequence, &data)
            })
            .await
            .map_err(|error| format!("The export writer stopped: {error}"))?
            .map_err(disk_error)?;
            sequence = sequence.checked_add(1).ok_or("The export is too large.")?;
        }
    }
    if expected_bytes.is_some_and(|length| length != received) {
        return Err("The export response was incomplete. No file was saved.".into());
    }
    if cancelled.is_cancelled() {
        return Err("Export cancelled.".into());
    }
    let window = owner.to_owned();
    let operation = id.to_owned();
    let committed = tauri::async_runtime::spawn_blocking(move || {
        streams.finish_with_length(&window, &operation, Some(received))
    })
    .await
    .map_err(|error| format!("The export writer stopped: {error}"))?
    .map_err(disk_error)?;
    // A cancellation after this complete rename cannot undo a saved file.
    Ok((committed.target, committed.preference))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::{TcpListener, TcpStream},
        path::PathBuf,
        sync::{
            atomic::{AtomicU64, Ordering},
            Mutex,
        },
        thread,
        time::Instant,
    };
    static NEXT_TEST: AtomicU64 = AtomicU64::new(1);
    struct Directory(PathBuf);
    impl Directory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "hict-http-export-{}-{}",
                std::process::id(),
                NEXT_TEST.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn staging_bytes(&self) -> u64 {
            std::fs::read_dir(&self.0)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".hict-save-")
                })
                // Windows directory enumeration can report the old size while
                // the writer is open. Query a live handle to observe writes;
                // otherwise this test waits for a close it deliberately stalls.
                .map(|entry| {
                    std::fs::File::open(entry.path())
                        .unwrap()
                        .metadata()
                        .unwrap()
                        .len()
                })
                .sum()
        }
        fn assert_clean(&self) {
            assert!(!std::fs::read_dir(&self.0)
                .unwrap()
                .filter_map(Result::ok)
                .any(|entry| entry
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
    fn request(url: String) -> CoordinateRequest {
        CoordinateRequest {
            url,
            body: "{\"x0Bp\":7,\"x1Bp\":31,\"snapshot\":\"fixed\"}".into(),
            headers: HashMap::from([
                ("X-HiCT-History-Session".into(), "frozen-session".into()),
                ("X-HiCT-History-Revision".into(), "17".into()),
                ("Cookie".into(), "must-not-be-forwarded".into()),
            ]),
        }
    }
    fn receive(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut raw = Vec::new();
        while !raw.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            stream.read_exact(&mut byte).unwrap();
            raw.push(byte[0]);
            assert!(raw.len() < 131_072);
        }
        let headers = String::from_utf8(raw.clone()).unwrap();
        let length = headers
            .lines()
            .filter_map(|line| line.split_once(':'))
            .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .map(|(_, value)| value.trim().parse::<usize>().unwrap())
            .unwrap_or(0);
        assert!(length <= 65_536);
        let mut body = vec![0; length];
        stream.read_exact(&mut body).unwrap();
        raw.extend(body);
        String::from_utf8(raw).unwrap()
    }
    fn listener() -> (TcpListener, String) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!(
            "http://{}/get_fasta_for_assembly",
            listener.local_addr().unwrap()
        );
        (listener, url)
    }
    fn start_file(dir: &Directory) -> (Arc<ExportStreams>, String, PathBuf) {
        let state = Arc::new(ExportStreams::default());
        let target = dir.0.join("saved sequence.fa");
        std::fs::write(&target, b"previous file").unwrap();
        let id = state.begin("main".into(), target.clone(), None).unwrap();
        (state, id, target)
    }
    #[test]
    fn addresses_and_revision_headers_are_bounded_without_network_access() {
        for url in [
            "http://localhost:5000/get_fasta_for_assembly",
            "http://127.0.0.1:8080/get_fasta_for_assembly",
            "http://127.0.0.1:37841/get_fasta_for_assembly",
            "https://10.0.0.1/base/get_fasta_for_selection",
            "http://[::1]:5000/get_agp_for_assembly",
        ] {
            let req = request(url.into());
            let (_, headers) = validate(&req).unwrap();
            assert_eq!(headers["x-hict-history-session"], "frozen-session");
            assert_eq!(headers["x-hict-history-revision"], "17");
            assert!(!headers.contains_key("cookie"));
            assert_eq!(headers[ACCEPT_ENCODING], "identity");
        }
        for url in [
            "https://example.com/get_fasta_for_assembly",
            "file:///get_fasta_for_assembly",
            "http://localhost/open",
            "http://user:password@localhost/get_fasta_for_assembly",
            "http://localhost/get_fasta_for_assembly?x=1",
            "http://localhost/get_fasta_for_assembly#x",
        ] {
            assert!(validate(&request(url.into())).is_err(), "{url}");
        }
        let mut req = request("http://localhost/get_fasta_for_assembly".into());
        req.body = "[]".into();
        assert!(validate(&req).is_err());
        req.body = "{".into();
        assert!(validate(&req).is_err());
        req.body = " ".repeat(65_537);
        assert!(validate(&req).is_err());
        req.body = "{}".into();
        req.headers
            .insert("x-hict-history-session".into(), "ambiguous".into());
        assert!(validate(&req).is_err());
        req.headers.remove("x-hict-history-session");
        req.headers.insert(
            "X-HiCT-History-Revision".into(),
            "1\r\nInjected: yes".into(),
        );
        assert!(validate(&req).is_err());
    }
    #[test]
    fn native_http_preserves_exact_bytes_and_captured_request() {
        let dir = Directory::new();
        let (state, id, target) = start_file(&dir);
        let (server, url) = listener();
        let payload: Vec<u8> = (0..8 * 1024 * 1024 + 19)
            .map(|index| (index % 251) as u8)
            .collect();
        let expected = payload.clone();
        let captured = Arc::new(Mutex::new(String::new()));
        let capture = captured.clone();
        let worker = thread::spawn(move || {
            let (mut stream, _) = server.accept().unwrap();
            *capture.lock().unwrap() = receive(&mut stream);
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",payload.len()).unwrap();
            for block in payload.chunks(32749) {
                stream.write_all(block).unwrap();
            }
        });
        let body = request(url.clone()).body;
        let (saved, _) =
            tauri::async_runtime::block_on(download(state, "main".into(), id, request(url)))
                .unwrap();
        worker.join().unwrap();
        assert_eq!(saved, target);
        assert_eq!(std::fs::read(target).unwrap(), expected);
        dir.assert_clean();
        let raw = captured.lock().unwrap();
        assert!(raw.starts_with("POST /get_fasta_for_assembly HTTP/1.1"));
        assert!(raw.ends_with(&body));
        let lower = raw.to_ascii_lowercase();
        assert!(lower.contains("x-hict-history-session: frozen-session\r\n"));
        assert!(lower.contains("x-hict-history-revision: 17\r\n"));
        assert!(!lower.contains("cookie:"));
    }
    #[test]
    fn failed_status_mime_and_truncated_responses_keep_existing_files() {
        for (status, mime, declared) in [
            (409, "text/plain", 4),
            (500, "text/plain", 4),
            (200, "application/json", 4),
            (200, "text/plain", 65536),
        ] {
            let dir = Directory::new();
            let (state, id, target) = start_file(&dir);
            let (server, url) = listener();
            let worker = thread::spawn(move || {
                let (mut stream, _) = server.accept().unwrap();
                receive(&mut stream);
                write!(stream,"HTTP/1.1 {status} Result\r\nContent-Type: {mime}\r\nContent-Length: {declared}\r\nConnection: close\r\n\r\nnope").unwrap();
            });
            let result = tauri::async_runtime::block_on(download(
                state.clone(),
                "main".into(),
                id.clone(),
                request(url),
            ));
            worker.join().unwrap();
            assert!(result.is_err(), "{status}/{mime}/{declared}");
            if status == 409 {
                assert!(result.unwrap_err().contains("assembly changed"));
            }
            assert_eq!(std::fs::read(target).unwrap(), b"previous file");
            assert!(state.cancellation("main", &id).is_err());
            dir.assert_clean();
        }
    }
    #[test]
    fn redirects_are_not_followed() {
        let dir = Directory::new();
        let (state, id, target) = start_file(&dir);
        let (server, url) = listener();
        let location = url.clone();
        let worker = thread::spawn(move || {
            let (mut stream, _) = server.accept().unwrap();
            receive(&mut stream);
            write!(stream,"HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
            drop(stream);
            server.set_nonblocking(true).unwrap();
            let end = Instant::now() + Duration::from_millis(300);
            while Instant::now() < end {
                assert!(server.accept().is_err(), "A redirect was followed");
                thread::sleep(Duration::from_millis(10));
            }
        });
        assert!(
            tauri::async_runtime::block_on(download(state, "main".into(), id, request(url)))
                .is_err()
        );
        worker.join().unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"previous file");
        dir.assert_clean();
    }
    #[test]
    fn cancellation_interrupts_waiting_headers_and_stalled_bodies() {
        for (body_started, navigation) in
            [(false, false), (true, false), (false, true), (true, true)]
        {
            let dir = Directory::new();
            let (state, id, target) = start_file(&dir);
            let (server, url) = listener();
            let (ready_tx, ready_rx) = std::sync::mpsc::channel();
            let (release_tx, release_rx) = std::sync::mpsc::channel();
            let worker = thread::spawn(move || {
                let (mut stream, _) = server.accept().unwrap();
                receive(&mut stream);
                if body_started {
                    stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 10000000\r\n\r\n").unwrap();
                    stream.write_all(&vec![b'A'; 65536]).unwrap();
                }
                ready_tx.send(()).unwrap();
                let _ = release_rx.recv_timeout(Duration::from_secs(5));
            });
            let task = tauri::async_runtime::spawn(download(
                state.clone(),
                "main".into(),
                id.clone(),
                request(url),
            ));
            ready_rx.recv_timeout(Duration::from_secs(5)).unwrap();
            if body_started {
                let end = Instant::now() + Duration::from_secs(5);
                while dir.staging_bytes() == 0 {
                    assert!(Instant::now() < end);
                    thread::sleep(Duration::from_millis(10));
                }
            }
            if navigation {
                // Cancellation must reach a stalled HTTP read before the disk
                // cleanup worker has acquired the pending-files lock.
                state.navigation_started("main");
            } else {
                state.abort("main", &id).unwrap();
            }
            let result = tauri::async_runtime::block_on(async {
                tokio::time::timeout(Duration::from_secs(2), task)
                    .await
                    .unwrap()
                    .unwrap()
            });
            assert!(result.is_err());
            let _ = release_tx.send(());
            worker.join().unwrap();
            assert_eq!(std::fs::read(target).unwrap(), b"previous file");
            dir.assert_clean();
        }
    }
    #[test]
    fn another_window_cannot_start_a_download_or_revoke_the_owner() {
        let dir = Directory::new();
        let (state, id, target) = start_file(&dir);
        let (server, url) = listener();
        server.set_nonblocking(true).unwrap();
        assert!(tauri::async_runtime::block_on(download(
            state.clone(),
            "other".into(),
            id.clone(),
            request(url)
        ))
        .is_err());
        assert!(server.accept().is_err());
        assert!(!state.cancellation("main", &id).unwrap().is_cancelled());
        state.abort("main", &id).unwrap();
        assert_eq!(std::fs::read(target).unwrap(), b"previous file");
        dir.assert_clean();
    }

    #[test]
    fn gzip_is_decoded_as_a_bounded_logical_file() {
        let dir = Directory::new();
        let (state, id, target) = start_file(&dir);
        let (server, url) = listener();
        const ENCODED: &[u8] = &[
            31, 139, 8, 0, 0, 0, 0, 0, 2, 3, 237, 196, 177, 13, 0, 16, 0, 0, 176, 221, 81, 18, 49,
            120, 192, 7, 34, 97, 177, 176, 248, 222, 33, 218, 161, 113, 223, 117, 70, 63, 179, 133,
            148, 75, 149, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73,
            146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36,
            73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146, 36, 73, 146,
            36, 73, 146, 36, 73, 250, 185, 7, 53, 184, 246, 252, 155, 208, 3, 0,
        ];
        let worker = thread::spawn(move || {
            let (mut stream, _) = server.accept().unwrap();
            receive(&mut stream);
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Encoding: gzip\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",ENCODED.len()).unwrap();
            stream.write_all(ENCODED).unwrap();
        });
        tauri::async_runtime::block_on(download(state, "main".into(), id, request(url))).unwrap();
        worker.join().unwrap();
        let mut expected = b">synthetic\n".to_vec();
        expected.extend(b"ACGT\n".repeat(50_000));
        assert_eq!(std::fs::read(target).unwrap(), expected);
        dir.assert_clean();
    }
}
