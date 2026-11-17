fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "quit_app",
            "save_export",
            "begin_export_stream",
            "write_export_chunk",
            "finish_export_stream",
            "abort_export_stream",
            "download_export_request",
        ]),
    ))
    .expect("failed to build HiCT Tauri browser metadata");
}
