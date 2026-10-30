//! Tauri commands: thin wrappers that call into `domain`.
//! Every command is annotated with `#[specta::specta]` and registered in `lib.rs`,
//! so the frontend calls it only through the generated `src/bindings.ts`.

use crate::domain;

#[tauri::command]
#[specta::specta]
pub fn app_version() -> String {
    domain::app_version().to_string()
}
