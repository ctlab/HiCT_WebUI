#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{env, net::IpAddr, process};
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

const DEFAULT_HICT_URL: &str = "http://127.0.0.1:8080/";

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
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
        .invoke_handler(tauri::generate_handler![quit_app])
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
