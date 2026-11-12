#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, net::IpAddr, process};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

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
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn save_export(
    window: tauri::WebviewWindow,
    filename: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    use tauri::Manager;
    let preference_path = window.app_handle().path().app_config_dir().ok()
        .map(|path| path.join("last-export-directory.txt"));
    let remembered = preference_path.as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .filter(|path| std::path::Path::new(path).is_dir());
    let safe_filename = sanitize_export_filename(&filename);
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title("Save HiCT export")
        .set_file_name(&safe_filename);
    if let Some(directory) = remembered.or_else(|| env::var("HICT_EXPORT_DIR").ok()) {
        dialog = dialog.set_directory(directory);
    }
    let Some(file) = dialog.save_file().await else {
        return Ok(None);
    };
    file.write(&bytes)
        .await
        .map_err(|error| format!("Failed to save export: {error}"))?;
    if let (Some(preference), Some(directory)) = (preference_path, file.path().parent()) {
        let remember = || -> std::io::Result<()> {
            if let Some(parent) = preference.parent() { std::fs::create_dir_all(parent)?; }
            std::fs::write(preference, directory.to_string_lossy().as_bytes())
        };
        if let Err(error) = remember() {
            eprintln!("Export saved, but its destination could not be remembered: {error}");
        }
    }
    Ok(Some(file.path().to_string_lossy().to_string()))
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
        Microsoft::Web::WebView2::Win32::{ICoreWebView2Profile2, ICoreWebView2_13},
        ClearBrowsingDataCompletedHandler,
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
            address.is_loopback()
                || address.is_unique_local()
                || address.is_unicast_link_local()
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
        .invoke_handler(tauri::generate_handler![quit_app, save_export])
        .setup(move |app| {
            let reset = env::var("HICT_RESET_WEBUI").as_deref() == Ok("1");
            let initial_url = if reset {
                "about:blank".parse()?
            } else {
                webui_url.clone()
            };
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(initial_url))
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
        .run(tauri::generate_context!())
        .expect("HiCT Tauri browser failed");
}
