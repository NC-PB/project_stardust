//! Tauri commands: thin wrappers that call into `domain`.
//! Every command is annotated with `#[specta::specta]` and registered in `lib.rs`,
//! so the frontend calls it only through the generated `src/bindings.ts`.

use std::path::Path;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;
use tauri_specta::Event;

use crate::domain;
use crate::domain::{
    agents_block, board, config, files, ids, init, make_task, prompts, search, task, templates,
    watch,
};

#[tauri::command]
#[specta::specta]
pub fn app_version() -> String {
    domain::app_version().to_string()
}

/// A new id for `kind`, unique across every file under `planning_root`.
#[tauri::command]
#[specta::specta]
pub fn new_id(planning_root: String, kind: ids::IdKind) -> Result<String, String> {
    ids::new_id(kind, Path::new(&planning_root)).map_err(|err| err.to_string())
}

/// Id and slug of a task filename, or `null` when the name is not a task file.
#[tauri::command]
#[specta::specta]
pub fn parse_task_filename(name: String) -> Option<ids::TaskFilename> {
    ids::parse_task_filename(&name)
}

/// The filename `<id>-<slug>.md` for a task with `title`.
#[tauri::command]
#[specta::specta]
pub fn task_filename(id: String, title: String) -> String {
    ids::task_filename(&id, &title)
}

/// The config of the repository at `repo_root`, with every problem found in it.
#[tauri::command]
#[specta::specta]
pub fn load_config(repo_root: String) -> config::ConfigReport {
    config::load_config(Path::new(&repo_root))
}

/// Every task file directly in the column folder `dir`, broken ones included.
#[tauri::command]
#[specta::specta]
pub fn read_column(dir: String) -> Result<Vec<task::Task>, String> {
    task::read_column(Path::new(&dir)).map_err(|err| err.to_string())
}

/// One task file.
#[tauri::command]
#[specta::specta]
pub fn read_task(path: String) -> task::Task {
    task::read_task(Path::new(&path))
}

/// Sets one frontmatter field of the task file at `path`, leaving the rest of the file as is.
#[tauri::command]
#[specta::specta]
pub fn set_task_field(path: String, key: String, value: task::FieldValue) -> Result<(), String> {
    let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let written = task::set_field(&text, &key, &value)?;
    std::fs::write(&path, written).map_err(|err| err.to_string())
}

/// Removes one frontmatter field of the task file at `path`, leaving the rest of the file as is.
#[tauri::command]
#[specta::specta]
pub fn remove_task_field(path: String, key: String) -> Result<(), String> {
    let text = std::fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let written = task::remove_field(&text, &key)?;
    if written != text {
        std::fs::write(&path, written).map_err(|err| err.to_string())?;
    }
    Ok(())
}

/// Moves the task file `file_name` from column `from` to column `to` of the repository at
/// `repo_root`, setting `completed` to today when `to` is the terminal column and removing it
/// when `from` is. Never overwrites a file; a failed move leaves the task where it was.
#[tauri::command]
#[specta::specta]
pub fn move_task(
    repo_root: String,
    file_name: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    board::move_task(repo_root, &config, &file_name, &from, &to, &today)
}

/// The whole text of the file at `path`, as the editor opens it.
#[tauri::command]
#[specta::specta]
pub fn read_text(path: String) -> Result<String, String> {
    files::read_text(Path::new(&path))
}

/// Writes `text` to the file at `path` unless it changed on disk since it held `expected`.
/// Fails instead of creating a file that was moved or removed.
#[tauri::command]
#[specta::specta]
pub fn save_text(
    path: String,
    expected: String,
    text: String,
) -> Result<files::SaveOutcome, String> {
    files::save_text(Path::new(&path), &expected, &text)
}

/// Creates the file at `path` with `text`; never overwrites one.
#[tauri::command]
#[specta::specta]
pub fn create_text(path: String, text: String) -> Result<(), String> {
    files::create_text(Path::new(&path), &text)
}

/// The task in `text`, an unsaved version of the file `file_name`.
#[tauri::command]
#[specta::specta]
pub fn parse_task_text(file_name: String, text: String) -> task::Task {
    task::parse_task(&file_name, &text)
}

/// `text` with frontmatter field `key` set to `value`; only the lines of that field change.
#[tauri::command]
#[specta::specta]
pub fn set_field_in_text(
    text: String,
    key: String,
    value: task::FieldValue,
) -> Result<String, String> {
    task::set_field(&text, &key, &value)
}

/// `text` without frontmatter field `key`.
#[tauri::command]
#[specta::specta]
pub fn remove_field_in_text(text: String, key: String) -> Result<String, String> {
    task::remove_field(&text, &key)
}

/// The image `src` of the markdown file `file` as a `data:` URL, if it is a local image inside
/// the repository at `repo_root`.
#[tauri::command]
#[specta::specta]
pub fn read_image(repo_root: String, file: String, src: String) -> Result<String, String> {
    files::image_data_url(Path::new(&repo_root), Path::new(&file), &src)
}

/// A new task in the first column from `selection`, text selected in the file `source`
/// (`S-make-task`). Returns the path of the new file.
#[tauri::command]
#[specta::specta]
pub fn make_task(repo_root: String, source: String, selection: String) -> Result<String, String> {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    make_task::make_task(repo_root, &config, Path::new(&source), &selection, &today)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

/// The braindump and the spec file of the repository at `repo_root`, where they exist.
#[tauri::command]
#[specta::specta]
pub fn source_files(repo_root: String) -> make_task::SourceFiles {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    make_task::source_files(repo_root, &config)
}

/// `prompt` filled for the repository at `repo_root` with `input`, ready for the clipboard
/// (`S-prompts`).
#[tauri::command]
#[specta::specta]
pub fn fill_prompt(
    repo_root: String,
    prompt: prompts::Prompt,
    input: prompts::PromptInput,
) -> Result<String, String> {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    prompts::fill_prompt(prompt, repo_root, &config, &input)
}

/// The template of `kind` for the repository at `repo_root`: the project override from
/// `templates_dir` for `task.md` and `spec.md`, otherwise the one shipped in the app.
#[tauri::command]
#[specta::specta]
pub fn load_template(repo_root: String, kind: templates::TemplateKind) -> templates::Template {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    templates::resolve(kind, repo_root, &config)
}

/// Writes the planner block into the agents file of the repository at `repo_root`, and the
/// import or mirror into `CLAUDE.md` as configured. Returns the files that changed.
#[tauri::command]
#[specta::specta]
pub fn write_planner_block(repo_root: String) -> Result<agents_block::BlockReport, String> {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    agents_block::write_planner_block(repo_root, &config)
}

/// Creates the config, spec, braindump and column folders in the repository at `repo_root`,
/// never overwriting a file, and says whether the `.gitignore` entry and the planner block
/// can be offered.
#[tauri::command]
#[specta::specta]
pub fn init_project(repo_root: String) -> Result<init::InitReport, String> {
    init::init_project(Path::new(&repo_root))
}

/// Adds the image root to `.gitignore` of the repository at `repo_root`. Returns whether the
/// file changed.
#[tauri::command]
#[specta::specta]
pub fn add_images_to_gitignore(repo_root: String) -> Result<bool, String> {
    let repo_root = Path::new(&repo_root);
    let config = config::load_config(repo_root).config;
    init::add_images_to_gitignore(repo_root, &config)
}

/// The search index of the open repository (`S-search-fulltext`), built by `watch_project`
/// and updated by its batches.
#[derive(Default)]
pub struct SearchState(Arc<Mutex<Option<search::SearchIndex>>>);

/// Files under the planning root of the watched repository containing every word of `query`,
/// best first, at most `limit`.
#[tauri::command]
#[specta::specta]
pub fn search(
    state: tauri::State<'_, SearchState>,
    query: String,
    limit: u32,
) -> Result<Vec<search::SearchHit>, String> {
    let index = state.0.lock().map_err(|err| err.to_string())?;
    Ok(index
        .as_ref()
        .map(|index| index.search(&query, limit as usize))
        .unwrap_or_default())
}

/// The watcher of the open repository; replaced by every `watch_project` call.
#[derive(Default)]
pub struct WatchState(Mutex<Option<watch::PlanningWatcher>>);

/// Sent once per burst of changes under the planning root or to the config.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct PlanningChanged {
    pub batch: watch::ChangeBatch,
    /// Files rewritten because the config changed and the planner block was regenerated.
    pub block_written: Vec<String>,
    /// Why the planner block could not be regenerated, if it could not.
    pub block_error: Option<String>,
}

/// Watches the planning root and the config of the repository at `repo_root`, sending
/// `PlanningChanged` events. A config change regenerates the planner block first. Stops the
/// previous watcher; call again after the planning root changed.
#[tauri::command]
#[specta::specta]
pub fn watch_project(
    app: AppHandle,
    state: tauri::State<'_, WatchState>,
    search_state: tauri::State<'_, SearchState>,
    repo_root: String,
) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|err| err.to_string())?;
    *current = None;
    let root = Path::new(&repo_root).to_path_buf();
    let config = config::load_config(&root).config;
    let index = Arc::clone(&search_state.0);
    *index.lock().map_err(|err| err.to_string())? =
        Some(search::SearchIndex::build(&root, &config.planning_root));
    let watcher = watch::watch(Path::new(&repo_root), &config, move |batch| {
        // The index is current before the app hears of the batch.
        if let Ok(mut index) = index.lock()
            && let Some(index) = index.as_mut()
        {
            index.apply(&batch);
        }
        let (block_written, block_error) = if batch.config_changed {
            let config = config::load_config(&root).config;
            match agents_block::write_planner_block(&root, &config) {
                Ok(report) => (report.written, None),
                Err(err) => (Vec::new(), Some(err)),
            }
        } else {
            (Vec::new(), None)
        };
        let _ = PlanningChanged {
            batch,
            block_written,
            block_error,
        }
        .emit(&app);
    })?;
    *current = Some(watcher);
    Ok(())
}

/// Stops watching and forgets the search index.
#[tauri::command]
#[specta::specta]
pub fn unwatch_project(
    state: tauri::State<'_, WatchState>,
    search_state: tauri::State<'_, SearchState>,
) -> Result<(), String> {
    *state.0.lock().map_err(|err| err.to_string())? = None;
    *search_state.0.lock().map_err(|err| err.to_string())? = None;
    Ok(())
}
