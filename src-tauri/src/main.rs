#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::{env, net::IpAddr, process};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

mod coordinate_download;
mod export_stream;
use export_stream::ExportStreams;

const DEFAULT_HICT_URL: &str = "http://127.0.0.1:8080/";

fn finish_browser_reset(window: &tauri::WebviewWindow, url: Url) {
    use tauri::Manager;
    if let Err(error) = window.navigate(url) {
        eprintln!("HiCT browser navigation after reset failed: {error}");
        window.app_handle().exit(1);
    } else {
        eprintln!("HICT_WEBUI_RESET_COMPLETE");
    }
}

#[tauri::command]
async fn quit_app(
    app: tauri::AppHandle,
    streams: tauri::State<'_, Arc<ExportStreams>>,
) -> Result<(), String> {
    let state = streams.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.shutdown())
        .await
        .map_err(|error| format!("Failed to stop active exports: {error}"))?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn save_export(
    window: tauri::WebviewWindow,
    filename: String,
    bytes: Vec<u8>,
    kind: Option<String>,
) -> Result<Option<String>, String> {
    let Some((target, preference_path)) =
        choose_export_path(&window, &filename, kind.as_deref()).await
    else {
        return Ok(None);
    };
    let saved_target = target.clone();
    tauri::async_runtime::spawn_blocking(move || write_export_file(&target, &bytes))
        .await
        .map_err(|error| format!("Failed to save export: {error}"))?
        .map_err(|error| format!("Failed to save export: {error}"))?;
    remember_export_directory(preference_path, &saved_target);
    Ok(Some(saved_target.to_string_lossy().to_string()))
}

async fn choose_export_path(
    window: &tauri::WebviewWindow,
    filename: &str,
    kind: Option<&str>,
) -> Option<(std::path::PathBuf, Option<std::path::PathBuf>)> {
    use tauri::Manager;
    let category = match kind {
        Some(
            value @ ("session" | "fasta" | "agp" | "figure" | "bookmarks" | "preset" | "pipeline"
            | "other"),
        ) => value,
        _ => "export",
    };
    let preference_path = window
        .app_handle()
        .path()
        .app_config_dir()
        .ok()
        .map(|path| path.join(format!("last-{category}-directory.txt")));
    let remembered = preference_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .filter(|path| std::path::Path::new(path).is_dir());
    let safe_filename = sanitize_export_filename(filename);
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_parent(window)
        .set_title("Save HiCT export")
        .set_file_name(&safe_filename);
    if let Some(directory) = remembered.or_else(|| env::var("HICT_EXPORT_DIR").ok()) {
        dialog = dialog.set_directory(directory);
    }
    dialog
        .save_file()
        .await
        .map(|file| (file.path().to_path_buf(), preference_path))
}

fn remember_export_directory(
    preference_path: Option<std::path::PathBuf>,
    target: &std::path::Path,
) {
    if let (Some(preference), Some(directory)) = (preference_path, target.parent()) {
        let remember = || -> std::io::Result<()> {
            if let Some(parent) = preference.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(preference, directory.to_string_lossy().as_bytes())
        };
        if let Err(error) = remember() {
            eprintln!("Export saved, but its destination could not be remembered: {error}");
        }
    }
}

#[tauri::command]
async fn begin_export_stream(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, Arc<ExportStreams>>,
    filename: String,
    kind: Option<String>,
) -> Result<Option<(String, String)>, String> {
    let state = streams.inner().clone();
    let owner = window.label().to_owned();
    let Some((target, preference)) = choose_export_path(&window, &filename, kind.as_deref()).await
    else {
        return Ok(None);
    };
    let path = target.to_string_lossy().to_string();
    let id = tauri::async_runtime::spawn_blocking(move || state.begin(owner, target, preference))
        .await
        .map_err(|error| format!("Failed to start export: {error}"))?
        .map_err(|error| format!("Failed to start export: {error}"))?;
    Ok(Some((id, path)))
}

#[tauri::command]
async fn write_export_chunk(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, Arc<ExportStreams>>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .filter(|value| !value.is_empty() && value.len() <= 256)
            .map(str::to_owned)
            .ok_or_else(|| {
                "The export transfer metadata is incomplete. Retry the export.".to_owned()
            })
    };
    let id = header("x-hict-export-id")?;
    let sequence = header("x-hict-export-sequence")?
        .parse::<u64>()
        .map_err(|_| "The export transfer order is invalid. Retry the export.".to_owned())?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The export transfer was not binary. Retry the export.".to_owned());
    };
    if bytes.len() > export_stream::MAX_CHUNK_BYTES {
        return Err("The export transfer exceeded its chunk limit. Retry the export.".to_owned());
    }
    let bytes = bytes.to_vec();
    let state = streams.inner().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || state.write(&owner, &id, sequence, &bytes))
        .await
        .map_err(|error| format!("Failed to write export: {error}"))?
        .map_err(|error| format!("Failed to write export: {error}"))
}

#[tauri::command]
async fn finish_export_stream(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, Arc<ExportStreams>>,
    id: String,
) -> Result<String, String> {
    let state = streams.inner().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let committed = state
            .finish(&owner, &id)
            .map_err(|error| format!("Failed to save export: {error}"))?;
        remember_export_directory(committed.preference, &committed.target);
        Ok(committed.target.to_string_lossy().to_string())
    })
    .await
    .map_err(|error| format!("Failed to save export: {error}"))?
}

#[tauri::command]
async fn abort_export_stream(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, Arc<ExportStreams>>,
    id: String,
) -> Result<(), String> {
    let state = streams.inner().clone();
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || state.abort(&owner, &id))
        .await
        .map_err(|error| format!("Failed to cancel export: {error}"))?
        .map_err(|error| format!("Failed to cancel export: {error}"))
}

#[tauri::command]
async fn download_export_request(
    window: tauri::WebviewWindow,
    streams: tauri::State<'_, Arc<ExportStreams>>,
    id: String,
    request: coordinate_download::CoordinateRequest,
) -> Result<String, String> {
    let state = streams.inner().clone();
    let owner = window.label().to_owned();
    let (target, preference) = coordinate_download::download(state, owner, id, request).await?;
    let path = target.to_string_lossy().to_string();
    if let Err(error) =
        tauri::async_runtime::spawn_blocking(move || remember_export_directory(preference, &target))
            .await
    {
        eprintln!("Export saved, but its destination could not be remembered: {error}");
    }
    Ok(path)
}

fn write_export_file(target: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = target
        .parent()
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::Other, "Missing destination directory")
        })?
        .join(format!(".hict-save-{}-{nonce}.tmp", std::process::id()));
    let mut created = false;
    let result = (|| {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        created = true;
        if let Ok(metadata) = std::fs::metadata(target) {
            file.set_permissions(metadata.permissions())?;
        }
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temporary, target)
    })();
    if result.is_err() && created {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod export_file_tests {
    use super::write_export_file;
    #[test]
    fn staging_replaces_complete_files_and_preserves_existing_data_on_failure() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "hict-native-save-test-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir(&dir).unwrap();
        let target = dir.join("session.json");
        write_export_file(&target, b"first").unwrap();
        write_export_file(&target, b"second").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        let destination_directory = dir.join("existing-directory");
        std::fs::create_dir(&destination_directory).unwrap();
        assert!(write_export_file(&destination_directory, b"invalid destination").is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"second");
        assert!(!std::fs::read_dir(&dir).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".hict-save-")));
        std::fs::remove_dir_all(dir).unwrap();
    }
}

#[cfg(target_os = "linux")]
fn reset_and_navigate(window: &tauri::WebviewWindow, url: Url) -> tauri::Result<()> {
    use tauri::Manager;
    use webkit2gtk::{WebViewExt, WebsiteDataManagerExtManual};

    let target = window.clone();
    window.with_webview(move |webview| {
        let Some(data) = webview.inner().website_data_manager() else {
            eprintln!("HiCT browser reset failed: WebKit data manager is unavailable");
            target.app_handle().exit(1);
            return;
        };
        // Tauri's generic clear call queues this work but does not await it.
        // Navigate only after completion so the page cannot read stale settings.
        data.clear(
            webkit2gtk::WebsiteDataTypes::ALL,
            webkit2gtk::glib::TimeSpan::from_seconds(0),
            None::<&webkit2gtk::gio::Cancellable>,
            move |result| {
                if let Err(error) = result {
                    eprintln!("HiCT browser reset failed: {error}");
                    target.app_handle().exit(1);
                } else {
                    finish_browser_reset(&target, url);
                }
            },
        );
    })
}

#[cfg(target_os = "windows")]
fn reset_and_navigate(window: &tauri::WebviewWindow, url: Url) -> tauri::Result<()> {
    use tauri::Manager;
    use webview2_com::{
        ClearBrowsingDataCompletedHandler,
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Profile2, ICoreWebView2_13},
    };
    use windows::core::Interface;

    let target = window.clone();
    window.with_webview(move |webview| {
        let completion_target = target.clone();
        let completed = ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
            if let Err(error) = result {
                eprintln!("HiCT browser reset failed: {error}");
                completion_target.app_handle().exit(1);
            } else {
                finish_browser_reset(&completion_target, url);
            }
            Ok(())
        }));
        // with_webview runs on the controller's UI thread. The COM handler is
        // retained by WebView2 until completion; do not navigate on mere enqueue.
        let start = || unsafe {
            webview
                .controller()
                .CoreWebView2()?
                .cast::<ICoreWebView2_13>()?
                .Profile()?
                .cast::<ICoreWebView2Profile2>()?
                .ClearBrowsingDataAll(&completed)
        };
        if let Err(error) = start() {
            eprintln!("HiCT browser reset could not start: {error}");
            target.app_handle().exit(1);
        }
    })
}

#[cfg(target_os = "macos")]
fn reset_and_navigate(window: &tauri::WebviewWindow, url: Url) -> tauri::Result<()> {
    use objc2::MainThreadMarker;
    use objc2_foundation::NSDate;
    use objc2_web_kit::{WKWebView, WKWebsiteDataStore};
    use tauri::Manager;

    let target = window.clone();
    window.with_webview(move |webview| {
        let Some(main_thread) = MainThreadMarker::new() else {
            eprintln!("HiCT browser reset must run on the WebKit main thread");
            target.app_handle().exit(1);
            return;
        };
        // Tauri supplies a live WKWebView pointer inside this main-thread
        // callback. WebKit copies and retains the block until clearing finishes.
        unsafe {
            let Some(view) = webview.inner().cast::<WKWebView>().as_ref() else {
                eprintln!("HiCT browser reset failed: WKWebView is unavailable");
                target.app_handle().exit(1);
                return;
            };
            let store = view.configuration().websiteDataStore();
            let types = WKWebsiteDataStore::allWebsiteDataTypes(main_thread);
            let since = NSDate::dateWithTimeIntervalSince1970(0.0);
            let completed = block2::RcBlock::new(move || {
                finish_browser_reset(&target, url.clone());
            });
            store.removeDataOfTypes_modifiedSince_completionHandler(&types, &since, &completed);
        }
    })
}

fn sanitize_export_filename(filename: &str) -> String {
    let candidate = filename
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ if character.is_control() => '_',
            _ => character,
        })
        .collect::<String>();
    if candidate.is_empty() {
        "hict-export.bin".to_string()
    } else {
        candidate
    }
}

fn requested_url() -> String {
    env::args()
        .skip(1)
        .find(|argument| {
            let lower = argument.to_ascii_lowercase();
            lower.starts_with("http://") || lower.starts_with("https://")
        })
        .or_else(|| env::var("HICT_TAURI_URL").ok())
        .unwrap_or_else(|| DEFAULT_HICT_URL.to_string())
}

fn allowed_local_url(raw_url: &str) -> Result<Url, String> {
    let url = Url::parse(raw_url).map_err(|error| format!("invalid URL '{raw_url}': {error}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!("unsupported URL scheme '{}'", url.scheme()));
    }
    let Some(host) = url.host_str().map(|host| host.to_ascii_lowercase()) else {
        return Err(format!("URL has no host: {raw_url}"));
    };
    if is_allowed_hict_host(&host) {
        Ok(url)
    } else {
        Err(format!(
            "HiCT Tauri browser only opens local HiCT WebUI URLs, got: {raw_url}"
        ))
    }
}

fn is_allowed_hict_host(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host == "localhost" {
        return true;
    }
    let Ok(address) = host.parse::<IpAddr>() else {
        return false;
    };
    match address {
        IpAddr::V4(address) => {
            address.is_loopback() || address.is_private() || address.is_link_local()
        }
        IpAddr::V6(address) => {
            address.is_loopback() || address.is_unique_local() || address.is_unicast_link_local()
        }
    }
}

fn main() {
    let webui_url = match allowed_local_url(&requested_url()) {
        Ok(url) => url,
        Err(error) => {
            eprintln!("HiCT Tauri browser refused to start: {error}");
            process::exit(2);
        }
    };

    tauri::Builder::default()
        .manage(Arc::new(ExportStreams::default()))
        .invoke_handler(tauri::generate_handler![quit_app, save_export, begin_export_stream, write_export_chunk, finish_export_stream, abort_export_stream, download_export_request])
        .on_window_event(|window, event| {
            use tauri::Manager;
            let state = window.state::<Arc<ExportStreams>>().inner().clone();
            let owner = window.label().to_owned();
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !state.window_closed(&owner) {
                    // Do not let the last window exit before temporary files
                    // are closed and removed. The second close is authorized.
                    api.prevent_close();
                    let target = window.clone();
                    tauri::async_runtime::spawn(async move {
                        match tauri::async_runtime::spawn_blocking(move || state.abort_window(&owner)).await {
                            Ok(()) => { let _ = target.close(); }
                            Err(error) => eprintln!("HiCT export cleanup before closing failed: {error}"),
                        }
                    });
                }
            } else if matches!(event, tauri::WindowEvent::Destroyed) {
                let _ = tauri::async_runtime::spawn_blocking(move || state.abort_window(&owner));
            }
        })
        .setup(move |app| {
            let reset = env::var("HICT_RESET_WEBUI").as_deref() == Ok("1");
            let initial_url = if reset {
                "about:blank".parse()?
            } else {
                webui_url.clone()
            };
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(initial_url))
                .initialization_script("Object.defineProperty(window, '__HICT_TAURI_EXPORT_STREAM_VERSION__', { value: 1 });")
                .title("HiCT")
                .inner_size(1480.0, 980.0)
                .min_inner_size(900.0, 640.0)
                .center()
                .build()?;
            if reset {
                reset_and_navigate(&window, webui_url.clone())?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("HiCT Tauri browser failed")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                use tauri::Manager;
                let state = app.state::<Arc<ExportStreams>>().inner().clone();
                if !state.shutdown_complete() {
                    // WebView/OS exit requests can bypass WindowEvent::CloseRequested.
                    // The process must remain alive until owned files are removed.
                    api.prevent_exit();
                    let handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        match tauri::async_runtime::spawn_blocking(move || state.shutdown()).await {
                            Ok(()) => handle.exit(code.unwrap_or(0)),
                            Err(error) => eprintln!("HiCT export cleanup before exiting failed: {error}"),
                        }
                    });
                }
            }
        });
}
