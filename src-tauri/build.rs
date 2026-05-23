fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&[
                "quit_app",
                "save_export",
            ])),
    )
    .expect("failed to build HiCT Tauri browser metadata");
}
