#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, fs, net::IpAddr, path::PathBuf, process};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

const DEFAULT_HICT_URL: &str = "http://127.0.0.1:8080/";

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn save_export(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    let safe_filename = sanitize_export_filename(&filename);
    let export_dir = export_directory()?;
    fs::create_dir_all(&export_dir)
        .map_err(|error| format!("failed to create export directory {export_dir:?}: {error}"))?;
    let output_path = export_dir.join(safe_filename);
    fs::write(&output_path, bytes)
        .map_err(|error| format!("failed to write export {output_path:?}: {error}"))?;
    Ok(output_path.to_string_lossy().to_string())
}

fn export_directory() -> Result<PathBuf, String> {
    let base = env::var("HICT_EXPORT_DIR")
        .ok()
        .or_else(|| env::var("HICT_DATA_DIR").ok())
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok())
        .ok_or_else(|| "failed to resolve export directory".to_string())?;
    Ok(base.join("hict-export"))
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
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(webui_url.clone()))
                .title("HiCT")
                .inner_size(1480.0, 980.0)
                .min_inner_size(900.0, 640.0)
                .center()
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("HiCT Tauri browser failed");
}
