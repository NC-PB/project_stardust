//! Project init (`S-init`): the config, the braindump, the spec and the column folders.
//!
//! Init never overwrites: a file that exists is left as it is and reported. The planner block
//! and the `.gitignore` entry for the image root are offered, not written; the caller applies
//! them with `agents_block::write_planner_block` and `add_images_to_gitignore`.

use std::io::Write;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::agents_block;
use super::config::{self, Config};
use super::ids::{self, IdKind};
use super::task::{self, FieldValue};
use super::templates::{self, TemplateKind};

const BRAINDUMP: &str = "\
---
id: {id}
title: Braindump
created: {created}
---

# Braindump

Loose ideas. Select text and use \"Make task\", or run \"Structure this\" / \"Integrate answers\" to move things into the spec.

-
";

/// What init did and what it can offer next. Paths are relative to the repository root.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct InitReport {
    /// Files and folders init created.
    pub created: Vec<String>,
    /// Files and folders that already existed and were left unchanged.
    pub existing: Vec<String>,
    /// Problems that did not stop init, such as an unreadable spec template override.
    pub issues: Vec<String>,
    /// Whether `.gitignore` does not yet list the image root.
    pub offer_gitignore: bool,
    /// Whether the agents file does not yet hold the current planner block.
    pub offer_planner_block: bool,
}

/// Creates a project in the repository at `repo_root`. An existing `docs/planner.yml` is used
/// as it is, so init on a configured repository fills in only what is missing.
pub fn init_project(repo_root: &Path) -> Result<InitReport, String> {
    if !repo_root.is_dir() {
        return Err(format!("{} is not a folder", repo_root.display()));
    }
    let mut report = InitReport {
        created: Vec::new(),
        existing: Vec::new(),
        issues: Vec::new(),
        offer_gitignore: false,
        offer_planner_block: false,
    };

    create_file(
        repo_root,
        config::CONFIG_PATH,
        TemplateKind::Config.builtin(),
        &mut report,
    )?;
    let config = config::load_config(repo_root).config;
    let root = &config.planning_root;

    create_dir(repo_root, root, &mut report)?;
    for column in &config.columns {
        create_dir(repo_root, &format!("{root}/{column}"), &mut report)?;
    }

    let spec_path = format!("{root}/spec.md");
    if !repo_root.join(root).join("spec").is_dir() {
        let template = templates::resolve(TemplateKind::Spec, repo_root, &config);
        report.issues.extend(template.issue);
        let text = stamp(
            repo_root,
            &config,
            &template.text,
            &["id", "created", "reviewed"],
        )?;
        create_file(repo_root, &spec_path, &text, &mut report)?;
    } else {
        report.existing.push(format!("{root}/spec/"));
    }

    let braindump = stamp(repo_root, &config, BRAINDUMP, &[])?;
    create_file(
        repo_root,
        &format!("{root}/braindump.md"),
        &braindump,
        &mut report,
    )?;

    report.offer_gitignore = !gitignore_lists(repo_root, &config.images_root);
    report.offer_planner_block = !planner_block_current(repo_root, &config);
    Ok(report)
}

/// `text` with a new id and today's date. `{id}` and `{created}` placeholders are filled; each
/// of `fields` is set in the frontmatter (`id` to the new id, the others to today).
fn stamp(repo_root: &Path, config: &Config, text: &str, fields: &[&str]) -> Result<String, String> {
    let id = ids::new_id(IdKind::Task, &repo_root.join(&config.planning_root))
        .map_err(|err| err.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut text = text.replace("{id}", &id).replace("{created}", &today);
    for &field in fields {
        let value = if field == "id" { &id } else { &today };
        text = task::set_field(&text, field, &FieldValue::Text(value.clone()))?;
    }
    Ok(text)
}

/// Writes `text` to `relative` unless something is already there.
fn create_file(
    repo_root: &Path,
    relative: &str,
    text: &str,
    report: &mut InitReport,
) -> Result<(), String> {
    let path = repo_root.join(relative);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("could not create the folder of {relative}: {err}"))?;
    }
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(mut file) => {
            file.write_all(text.as_bytes())
                .map_err(|err| format!("could not write {relative}: {err}"))?;
            report.created.push(relative.to_string());
        }
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
            report.existing.push(relative.to_string());
        }
        Err(err) => return Err(format!("could not create {relative}: {err}")),
    }
    Ok(())
}

fn create_dir(repo_root: &Path, relative: &str, report: &mut InitReport) -> Result<(), String> {
    let path = repo_root.join(relative);
    let name = format!("{relative}/");
    if path.is_dir() {
        report.existing.push(name);
        return Ok(());
    }
    std::fs::create_dir_all(&path).map_err(|err| format!("could not create {name}: {err}"))?;
    report.created.push(name);
    Ok(())
}

/// Whether `.gitignore` at the repository root has a line for `images_root`.
pub fn gitignore_lists(repo_root: &Path, images_root: &str) -> bool {
    let wanted = images_root.trim_matches('/');
    std::fs::read_to_string(repo_root.join(".gitignore")).is_ok_and(|text| {
        text.lines()
            .any(|line| line.trim().trim_matches('/') == wanted)
    })
}

/// Adds `<images_root>/` to `.gitignore`, creating the file if needed. Returns whether the
/// file changed; nothing is written when the entry is already there.
pub fn add_images_to_gitignore(repo_root: &Path, config: &Config) -> Result<bool, String> {
    if gitignore_lists(repo_root, &config.images_root) {
        return Ok(false);
    }
    let path = repo_root.join(".gitignore");
    let existing = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(err) => return Err(format!("could not read .gitignore: {err}")),
    };
    let newline = if existing.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let separator = if existing.is_empty() || existing.ends_with(newline) {
        ""
    } else {
        newline
    };
    let line = format!("{}/", config.images_root.trim_end_matches('/'));
    std::fs::write(&path, format!("{existing}{separator}{line}{newline}"))
        .map_err(|err| format!("could not write .gitignore: {err}"))?;
    Ok(true)
}

fn planner_block_current(repo_root: &Path, config: &Config) -> bool {
    let block = agents_block::render_block(config, repo_root);
    std::fs::read_to_string(repo_root.join(&config.agents_file))
        .is_ok_and(|text| text.replace("\r\n", "\n").contains(&block))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch_repo() -> PathBuf {
        let root = std::env::temp_dir().join(format!("stardust-init-{}", ids::random_suffix()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn read(root: &Path, relative: &str) -> String {
        std::fs::read_to_string(root.join(relative)).unwrap()
    }

    #[test]
    fn creates_config_spec_braindump_and_columns() {
        let root = scratch_repo();
        let report = init_project(&root).unwrap();
        let spec = read(&root, "docs/planning/spec.md");
        let braindump = read(&root, "docs/planning/braindump.md");
        let config = config::load_config(&root);
        let spec_task = task::read_task(&root.join("docs/planning/spec.md"));
        let braindump_task = task::read_task(&root.join("docs/planning/braindump.md"));
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(
            report.created,
            [
                "docs/planner.yml",
                "docs/planning/",
                "docs/planning/inbox/",
                "docs/planning/next/",
                "docs/planning/done/",
                "docs/planning/spec.md",
                "docs/planning/braindump.md",
            ]
        );
        assert_eq!(report.existing, Vec::<String>::new());
        assert_eq!(report.issues, Vec::<String>::new());
        assert!(report.offer_gitignore);
        assert!(report.offer_planner_block);

        assert!(config.found);
        assert_eq!(config.issues, []);
        assert_eq!(config.missing_columns, Vec::<String>::new());

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        for (text, parsed) in [(&spec, &spec_task), (&braindump, &braindump_task)] {
            // Only the filename lacks an id; spec and braindump are not tasks.
            let field_issues: Vec<_> = parsed.issues.iter().filter(|i| i.key.is_some()).collect();
            assert_eq!(field_issues, Vec::<&task::TaskIssue>::new(), "{text}");
            assert!(ids::is_task_id(parsed.id.as_deref().unwrap()));
            assert_eq!(parsed.created.as_deref(), Some(today.as_str()));
        }
        for text in [&spec, &braindump] {
            // Strict YAML, so the frontmatter renders on GitHub (`R-plain-markdown`).
            let frontmatter = text.split("---\n").nth(1).unwrap();
            serde_norway::from_str::<serde_norway::Value>(frontmatter).unwrap();
        }
        assert_ne!(spec_task.id, braindump_task.id);
        assert!(spec.contains(&format!("reviewed: {today}\n")));
        assert!(spec.contains("## Structure"));
        assert!(braindump.contains("# Braindump"));
        assert!(!braindump.contains('{'));
    }

    #[test]
    fn never_overwrites_existing_files() {
        let root = scratch_repo();
        std::fs::create_dir_all(root.join("docs/planning/next")).unwrap();
        std::fs::write(
            root.join("docs/planner.yml"),
            "columns: [todo, next, finished]\n",
        )
        .unwrap();
        std::fs::write(root.join("docs/planning/spec.md"), "mine\n").unwrap();
        let report = init_project(&root).unwrap();
        let config = read(&root, "docs/planner.yml");
        let spec = read(&root, "docs/planning/spec.md");
        let inbox = root.join("docs/planning/inbox").exists();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(config, "columns: [todo, next, finished]\n");
        assert_eq!(spec, "mine\n");
        assert!(!inbox, "columns come from the existing config");
        assert_eq!(
            report.created,
            [
                "docs/planning/todo/",
                "docs/planning/finished/",
                "docs/planning/braindump.md",
            ]
        );
        assert_eq!(
            report.existing,
            [
                "docs/planner.yml",
                "docs/planning/",
                "docs/planning/next/",
                "docs/planning/spec.md",
            ]
        );
    }

    #[test]
    fn a_second_init_changes_nothing() {
        let root = scratch_repo();
        init_project(&root).unwrap();
        let spec = read(&root, "docs/planning/spec.md");
        let report = init_project(&root).unwrap();
        let spec_again = read(&root, "docs/planning/spec.md");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.created, Vec::<String>::new());
        assert_eq!(report.existing.len(), 7);
        assert_eq!(spec, spec_again);
    }

    #[test]
    fn a_spec_folder_is_kept_and_no_spec_file_is_added() {
        let root = scratch_repo();
        std::fs::create_dir_all(root.join("docs/planning/spec")).unwrap();
        let report = init_project(&root).unwrap();
        let file = root.join("docs/planning/spec.md").exists();
        std::fs::remove_dir_all(&root).unwrap();

        assert!(!file);
        assert!(report.existing.contains(&"docs/planning/spec/".to_string()));
    }

    #[test]
    fn the_spec_template_override_is_used() {
        let root = scratch_repo();
        std::fs::create_dir_all(root.join("docs/templates")).unwrap();
        std::fs::write(root.join("docs/templates/spec.md"), "# Own spec\n").unwrap();
        init_project(&root).unwrap();
        let spec = read(&root, "docs/planning/spec.md");
        std::fs::remove_dir_all(&root).unwrap();

        assert!(spec.starts_with("---\nid: "));
        assert!(spec.ends_with("---\n# Own spec\n"));
    }

    #[test]
    fn offers_disappear_once_applied() {
        let root = scratch_repo();
        init_project(&root).unwrap();
        let config = config::load_config(&root).config;
        assert!(add_images_to_gitignore(&root, &config).unwrap());
        assert!(!add_images_to_gitignore(&root, &config).unwrap());
        agents_block::write_planner_block(&root, &config).unwrap();
        let report = init_project(&root).unwrap();
        let gitignore = read(&root, ".gitignore");
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(gitignore, "docs/images/\n");
        assert!(!report.offer_gitignore);
        assert!(!report.offer_planner_block);
    }

    #[test]
    fn gitignore_entries_match_with_or_without_slashes() {
        let root = scratch_repo();
        std::fs::write(root.join(".gitignore"), "node_modules\n/docs/images\n").unwrap();
        let listed = gitignore_lists(&root, "docs/images");
        std::fs::write(root.join(".gitignore"), "dist").unwrap();
        let config = Config::default();
        add_images_to_gitignore(&root, &config).unwrap();
        let appended = read(&root, ".gitignore");
        std::fs::remove_dir_all(&root).unwrap();

        assert!(listed);
        assert_eq!(appended, "dist\ndocs/images/\n");
    }

    #[test]
    fn a_missing_repository_folder_is_not_created() {
        let root = std::env::temp_dir().join(format!("stardust-init-{}", ids::random_suffix()));
        assert!(
            init_project(&root)
                .unwrap_err()
                .ends_with("is not a folder")
        );
        assert!(!root.exists());
    }

    #[test]
    fn this_repository_needs_no_init() {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let config = config::load_config(repo_root).config;
        assert!(gitignore_lists(repo_root, &config.images_root));
        assert!(planner_block_current(repo_root, &config));
    }
}
