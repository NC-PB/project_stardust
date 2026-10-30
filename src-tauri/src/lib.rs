mod commands;
pub mod domain;

use tauri_specta::{Builder, collect_commands};

const BINDINGS_PATH: &str = "../src/bindings.ts";

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::app_version,
        commands::new_id,
        commands::parse_task_filename,
        commands::task_filename,
        commands::load_config,
        commands::read_column,
        commands::read_task,
        commands::set_task_field,
        commands::remove_task_field,
        commands::load_template,
    ])
}

fn export_bindings(builder: &Builder<tauri::Wry>) {
    builder
        .export(specta_typescript::Typescript::default(), BINDINGS_PATH)
        .expect("failed to export TypeScript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regenerates `src/bindings.ts`; `npm run check` then type-checks the frontend against it.
    #[test]
    fn export_typescript_bindings() {
        export_bindings(&specta_builder());
    }
}
