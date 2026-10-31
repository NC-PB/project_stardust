mod commands;
pub mod domain;

use tauri_specta::{Builder, collect_commands, collect_events};

const BINDINGS_PATH: &str = "../src/bindings.ts";

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            commands::app_version,
            commands::new_id,
            commands::parse_task_filename,
            commands::task_filename,
            commands::load_config,
            commands::read_spec,
            commands::parse_spec_text,
            commands::gate_status,
            commands::check_append_only,
            commands::answer_question,
            commands::list_proposals,
            commands::missing_code_paths,
            commands::plan_spec_split,
            commands::split_spec,
            commands::plan_gitattributes,
            commands::add_gitattributes,
            commands::changelog_tags,
            commands::draft_changelog,
            commands::write_changelog,
            commands::read_column,
            commands::read_task,
            commands::set_task_field,
            commands::remove_task_field,
            commands::move_task,
            commands::read_text,
            commands::save_text,
            commands::create_text,
            commands::trash_file,
            commands::parse_task_text,
            commands::set_field_in_text,
            commands::remove_field_in_text,
            commands::read_image,
            commands::import_image,
            commands::make_task,
            commands::source_files,
            commands::fill_prompt,
            commands::search,
            commands::open_terminal,
            commands::load_template,
            commands::write_planner_block,
            commands::init_project,
            commands::add_images_to_gitignore,
            commands::watch_project,
            commands::unwatch_project,
            commands::broken_links,
        ])
        .events(collect_events![commands::PlanningChanged])
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(commands::WatchState::default())
        .manage(commands::SearchState::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
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
