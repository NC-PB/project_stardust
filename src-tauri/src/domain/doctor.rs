//! The doctor (`S-doctor`): one read-only check of the planning files that lists what is broken,
//! each finding with its file and line, and the fixes that are obvious.
//!
//! It reuses the checks that already exist instead of repeating them: the task reader's issues
//! (`task.rs`, D-20261030-215110-cgf7) for ids and frontmatter, the unresolved links of the
//! repair by id (`link_repair::broken_links`, D-20261031-030346-r7tb) for links and images,
//! and the spec model for untraced tasks. Task files are the files directly in the columns and
//! in the archive's month folders of the terminal column (`R-unique-ids`, D-20261031-030525-r8mz).
//!
//! Nothing is fixed here. A fix is data on its finding; [`apply_fix`] applies one after the user
//! confirmed it, checking again that it still applies and writing against the text it read.

use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::config::Config;
use super::files::{self, SaveOutcome, percent_decode};
use super::ids::{self, IdKind};
use super::link_repair::{self, BrokenReason, RepairScope};
use super::links::{self, Move, MoveLinks, components, local_path, resolve};
use super::spec::{self, Node};
use super::task::{self, FieldValue, NO_FILENAME_ID, Task};

/// What a finding is about, in the order the doctor lists them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum FindingKind {
    /// Several task files carry the same id (`R-unique-ids`).
    DuplicateId,
    /// A task file without an id in its filename, or without `id` in its frontmatter.
    MissingId,
    /// The frontmatter id differs from the filename id, which wins (`R-filename-truth`).
    IdMismatch,
    /// A relative link that does not resolve; repairable by id or not.
    BrokenLink,
    /// A relative link to an image file that does not exist (`S-images`).
    MissingImage,
    /// Frontmatter that is not valid, or a field that is missing or has an invalid value.
    FrontmatterError,
    /// A task outside the terminal column without `implements`, or an `implements` entry
    /// naming no node of the Structure (`S-trace`).
    Untraced,
}

/// A fix the doctor offers; applied only by [`apply_fix`], after confirmation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DoctorFix {
    /// Writes `id` as the frontmatter `id` of `file` (relative to the repository root).
    SetId { file: String, id: String },
    /// Renames `file` to `to` in the same folder and writes `id`, the id at the start of `to`,
    /// as its frontmatter `id`. Links to the file follow it.
    Rename {
        file: String,
        to: String,
        id: String,
    },
    /// Repairs the broken links of `file` by the id in their target's filename (`S-links`).
    RepairLinks { file: String },
}

/// One problem found by the doctor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct Finding {
    pub kind: FindingKind,
    /// The file, relative to the repository root.
    pub file: String,
    /// 1-based line in the file.
    pub line: u32,
    /// What is wrong, in one sentence.
    pub message: String,
    /// The obvious fix, when there is one.
    pub fix: Option<DoctorFix>,
}

/// Everything the doctor found.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Type)]
pub struct DoctorReport {
    /// Ordered by kind, then file, then line.
    pub findings: Vec<Finding>,
    /// How many task files were checked, archive included.
    pub task_files: u32,
    /// What could not be checked at all, such as a column folder that cannot be read.
    pub problems: Vec<String>,
}

/// What applying a fix did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FixReport {
    /// The fixed file where it is now, relative to the repository root.
    pub file: String,
    /// The links rewritten to follow a renamed file.
    pub links: MoveLinks,
}

/// A task file as the doctor sees it.
struct TaskFile {
    /// Relative to the repository root.
    file: String,
    column: String,
    /// In a month folder of the terminal column.
    archived: bool,
    /// `None` when the file could not be read as text.
    text: Option<String>,
    task: Task,
}

/// Checks the planning files of the repository at `repo_root`. Writes nothing.
pub fn doctor(repo_root: &Path, config: &Config) -> DoctorReport {
    let mut report = DoctorReport::default();
    let tasks = task_files(repo_root, config, &mut report.problems);
    report.task_files = tasks.len() as u32;
    let mut fresh = FreshIds::new(repo_root.join(&config.planning_root));

    // How often each effective id is carried, for duplicates and for the missing id fix.
    let mut by_id: BTreeMap<&str, Vec<&TaskFile>> = BTreeMap::new();
    for file in &tasks {
        if let Some(id) = file.task.id.as_deref() {
            by_id.entry(id).or_default().push(file);
        }
    }

    for file in &tasks {
        report
            .findings
            .extend(id_and_frontmatter(file, &by_id, &mut fresh));
    }
    for (id, files) in by_id.iter().filter(|(_, files)| files.len() > 1) {
        for file in files {
            report.findings.push(duplicate(file, id, files, &mut fresh));
        }
    }
    report.findings.extend(untraced(repo_root, config, &tasks));
    report
        .findings
        .extend(link_findings(repo_root, config, &mut report.problems));

    report
        .findings
        .sort_by(|a, b| (a.kind, &a.file, a.line).cmp(&(b.kind, &b.file, b.line)));
    report
}

/// The task files of every column, and of the month folders (`YYYY-MM`) of the terminal column,
/// each folder by file name.
fn task_files(repo_root: &Path, config: &Config, problems: &mut Vec<String>) -> Vec<TaskFile> {
    let planning = config.planning_root.trim_end_matches('/');
    let mut files = Vec::new();
    for column in &config.columns {
        let folder = format!("{planning}/{column}");
        let mut folders = vec![(folder.clone(), false)];
        if column == &config.terminal
            && let Ok(entries) = std::fs::read_dir(repo_root.join(&folder))
        {
            let mut months: Vec<String> = entries
                .filter_map(Result::ok)
                .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| is_month(name))
                .collect();
            months.sort();
            folders.extend(months.into_iter().map(|m| (format!("{folder}/{m}"), true)));
        }
        for (folder, archived) in folders {
            let names = match markdown_names(&repo_root.join(&folder)) {
                Ok(names) => names,
                Err(err) => {
                    problems.push(format!("could not read {folder}: {err}"));
                    continue;
                }
            };
            for name in names {
                let path = repo_root.join(&folder).join(&name);
                let text = std::fs::read_to_string(&path).ok();
                let task = match &text {
                    Some(text) => task::parse_task(&name, text),
                    None => task::read_task(&path),
                };
                files.push(TaskFile {
                    file: format!("{folder}/{name}"),
                    column: column.clone(),
                    archived,
                    text,
                    task,
                });
            }
        }
    }
    files
}

fn markdown_names(dir: &Path) -> std::io::Result<Vec<String>> {
    let mut names: Vec<String> = std::fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_file()))
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".md"))
        .collect();
    names.sort();
    Ok(names)
}

/// `YYYY-MM`, the name of an archive folder.
fn is_month(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 7
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(i, b)| i == 4 || b.is_ascii_digit())
}

/// The 1-based line of the frontmatter field `key` in `text`, or 1 when there is none.
fn field_line(text: Option<&str>, key: &str) -> u32 {
    text.and_then(|text| find_field(text, key)).unwrap_or(1)
}

/// The 1-based line of the frontmatter field `key` in `text`, when the frontmatter has it.
fn find_field(text: &str, key: &str) -> Option<u32> {
    let mut lines = text.lines().enumerate();
    if lines.next()?.1.trim_end() != "---" {
        return None;
    }
    for (index, line) in lines {
        if line.trim_end() == "---" {
            return None;
        }
        if line
            .strip_prefix(key)
            .is_some_and(|rest| rest.starts_with(':'))
        {
            return Some(index as u32 + 1);
        }
    }
    None
}

/// New task ids, unique across the planning root and among each other.
struct FreshIds {
    planning: std::path::PathBuf,
    taken: Option<HashSet<String>>,
}

impl FreshIds {
    fn new(planning: std::path::PathBuf) -> Self {
        Self {
            planning,
            taken: None,
        }
    }

    /// A new id, or `None` when none can be made (the fix is then not offered).
    fn next(&mut self) -> Option<String> {
        let planning = &self.planning;
        let taken = self
            .taken
            .get_or_insert_with(|| ids::existing_ids(planning).unwrap_or_default());
        let now = chrono::Local::now().naive_local();
        let id = ids::generate_id(IdKind::Task, now, taken, ids::random_suffix).ok()?;
        taken.insert(id.clone());
        Some(id)
    }
}

/// `<id>-<slug>.md` with the slug of `file_name` when it has one, else from `title`.
fn renamed(file_name: &str, title: &str, id: &str) -> String {
    match ids::parse_task_filename(file_name) {
        Some(name) if name.slug.is_empty() => format!("{id}.md"),
        Some(name) => format!("{id}-{}.md", name.slug),
        None => ids::task_filename(id, title),
    }
}

/// The findings of the task reader's issues: missing ids, id mismatches, frontmatter errors.
fn id_and_frontmatter(
    file: &TaskFile,
    by_id: &BTreeMap<&str, Vec<&TaskFile>>,
    fresh: &mut FreshIds,
) -> Vec<Finding> {
    let task = &file.task;
    let text = file.text.as_deref();
    let name_id = ids::parse_task_filename(&task.file_name).map(|name| name.id);
    let mut findings = Vec::new();
    // `id` is required (`S-task-format`), but the reader takes the filename id without it. A
    // file without frontmatter is a frontmatter error; without a filename id the rename below
    // writes the frontmatter id too.
    if let (Some(id), Some(text)) = (&name_id, text)
        && text.starts_with("---")
        && task.issues.iter().all(|issue| issue.key.is_some())
        && find_field(text, "id").is_none()
    {
        findings.push(Finding {
            kind: FindingKind::MissingId,
            file: file.file.clone(),
            line: 1,
            message: "the frontmatter has no `id`".into(),
            fix: Some(DoctorFix::SetId {
                file: file.file.clone(),
                id: id.clone(),
            }),
        });
    }
    for issue in &task.issues {
        match (issue.key.as_deref(), &name_id) {
            (None, _) if issue.message == NO_FILENAME_ID => {
                // The frontmatter id is kept when no other task file carries it.
                let unique = task
                    .id
                    .as_deref()
                    .filter(|id| by_id.get(id).is_some_and(|files| files.len() == 1))
                    .map(str::to_string);
                // A taken target name is refused when the fix is applied.
                let fix = unique.or_else(|| fresh.next()).map(|id| DoctorFix::Rename {
                    file: file.file.clone(),
                    to: renamed(&task.file_name, &task.title, &id),
                    id,
                });
                findings.push(Finding {
                    kind: FindingKind::MissingId,
                    file: file.file.clone(),
                    line: 1,
                    message: "the filename does not start with a task id".into(),
                    fix,
                });
            }
            (Some("id"), Some(id)) => findings.push(Finding {
                kind: FindingKind::IdMismatch,
                file: file.file.clone(),
                line: field_line(text, "id"),
                message: format!("frontmatter `id`: {}", issue.message),
                fix: Some(DoctorFix::SetId {
                    file: file.file.clone(),
                    id: id.clone(),
                }),
            }),
            (key, _) => findings.push(Finding {
                kind: FindingKind::FrontmatterError,
                file: file.file.clone(),
                line: key.map_or(1, |key| field_line(text, key)),
                message: match key {
                    Some(key) => format!("`{key}`: {}", issue.message),
                    None => issue.message.clone(),
                },
                fix: None,
            }),
        }
    }
    findings
}

/// The finding for `file`, one of several task files carrying `id`.
fn duplicate(file: &TaskFile, id: &str, files: &[&TaskFile], fresh: &mut FreshIds) -> Finding {
    let others: Vec<&str> = files
        .iter()
        .filter(|other| other.file != file.file)
        .map(|other| other.file.as_str())
        .collect();
    // A file without a filename id gets its new id from the missing id fix.
    let fix = ids::parse_task_filename(&file.task.file_name)
        .and_then(|_| fresh.next())
        .map(|new| DoctorFix::Rename {
            file: file.file.clone(),
            to: renamed(&file.task.file_name, &file.task.title, &new),
            id: new,
        });
    Finding {
        kind: FindingKind::DuplicateId,
        file: file.file.clone(),
        line: field_line(file.text.as_deref(), "id"),
        message: format!("the id `{id}` is also used by {}", others.join(", ")),
        fix,
    }
}

/// Tasks outside the terminal column without `implements`, and `implements` entries naming no
/// node, for the tasks directly in the columns, as the trace counts them (D-20261031-013706-d7rx,
/// D-20261031-030552-k3qa). Entries are checked only when the spec exists, and not at all in a
/// file whose frontmatter could not be read as a whole: that is a frontmatter error already.
fn untraced(repo_root: &Path, config: &Config, tasks: &[TaskFile]) -> Vec<Finding> {
    let spec = spec::read_spec(repo_root, config);
    let mut known = HashSet::new();
    collect_node_ids(&spec.structure, &mut known);
    let mut findings = Vec::new();
    let readable = |file: &&TaskFile| {
        file.task
            .issues
            .iter()
            .all(|issue| issue.key.is_some() || issue.message == NO_FILENAME_ID)
    };
    for file in tasks.iter().filter(|file| !file.archived).filter(readable) {
        let line = field_line(file.text.as_deref(), "implements");
        let mut entries: Vec<&str> = Vec::new();
        for entry in file.task.implements.iter().map(|e| e.trim()) {
            if !entry.is_empty() && !entries.contains(&entry) {
                entries.push(entry);
            }
        }
        if entries.is_empty() && file.column != config.terminal {
            findings.push(Finding {
                kind: FindingKind::Untraced,
                file: file.file.clone(),
                line,
                message: "no `implements`: the task names no node of the Structure".into(),
                fix: None,
            });
        }
        if !spec.found {
            continue;
        }
        for entry in entries.into_iter().filter(|e| !known.contains(*e)) {
            findings.push(Finding {
                kind: FindingKind::Untraced,
                file: file.file.clone(),
                line,
                message: format!("`{entry}` in `implements` names no node of the Structure"),
                fix: None,
            });
        }
    }
    findings
}

fn collect_node_ids(nodes: &[Node], into: &mut HashSet<String>) {
    for node in nodes {
        if let Some(id) = &node.id {
            into.insert(id.clone());
        }
        collect_node_ids(&node.children, into);
    }
}

/// The broken links and missing images that concern the planning: links in files under the
/// planning root, and links from anywhere in the repository that point into it. Links in the
/// templates folder are written for the place a task will have, so they are not checked. A
/// broken link the repair by id would change is listed with that repair as its fix; the watcher
/// repairs such links when the project is opened, so they are seen only in between.
fn link_findings(repo_root: &Path, config: &Config, problems: &mut Vec<String>) -> Vec<Finding> {
    let planning = components(&config.planning_root);
    let templates = components(&config.templates_dir);
    let concerns_planning = |file: &str, target: &str| {
        let parts = components(file);
        if !templates.is_empty() && parts.starts_with(&templates) {
            return false;
        }
        let path = local_path(target).map_or(target, |(path, _)| path);
        let dir = &parts[..parts.len().saturating_sub(1)];
        parts.starts_with(&planning)
            || resolve(dir, path).is_some_and(|target| target.starts_with(&planning))
    };
    let is_image = |target: &str| {
        let path = local_path(target).map_or(target, |(path, _)| path);
        files::image_mime(Path::new(&percent_decode(path))).is_some()
    };
    let missing_image = |file: &str, line: u32, target: &str| Finding {
        kind: FindingKind::MissingImage,
        file: file.to_string(),
        line,
        message: format!(
            "no image at `{target}`; images are kept out of version control, so it may be on another machine"
        ),
        fix: None,
    };

    let check = link_repair::check_links(repo_root, &config.planning_root);
    problems.extend(check.problems);
    let mut findings = Vec::new();
    for file in check.repaired {
        for change in file.changes {
            if !concerns_planning(&file.file, &change.old) {
                continue;
            }
            if is_image(&change.old) {
                findings.push(missing_image(&file.file, change.line, &change.old));
                continue;
            }
            findings.push(Finding {
                kind: FindingKind::BrokenLink,
                file: file.file.clone(),
                line: change.line,
                message: format!(
                    "`{}` does not resolve; the task file with its id is at `{}`",
                    change.old, change.new
                ),
                fix: Some(DoctorFix::RepairLinks {
                    file: file.file.clone(),
                }),
            });
        }
    }
    for broken in check.unresolved {
        if !concerns_planning(&broken.file, &broken.target) {
            continue;
        }
        let target = &broken.target;
        if is_image(target) {
            findings.push(missing_image(&broken.file, broken.line, target));
            continue;
        }
        let message = match &broken.reason {
            BrokenReason::NoId => format!("`{target}` does not resolve"),
            BrokenReason::UnknownId { id } => {
                format!("`{target}` does not resolve, and no task file has the id `{id}`")
            }
            BrokenReason::AmbiguousId { id, files } => format!(
                "`{target}` does not resolve, and several task files have the id `{id}`: {}",
                files.join(", ")
            ),
        };
        findings.push(Finding {
            kind: FindingKind::BrokenLink,
            file: broken.file,
            line: broken.line,
            message,
            fix: None,
        });
    }
    findings
}

/// Repairs the links of the markdown file `file` by id, written against the text read.
fn repair_file(repo_root: &Path, config: &Config, file: &str) -> Result<FixReport, String> {
    let parts = components(file);
    if parts.is_empty() || parts.iter().any(|part| part == "..") || !file.ends_with(".md") {
        return Err(format!("`{file}` is not a markdown file of the repository"));
    }
    let scope = RepairScope::Ids {
        ids: BTreeSet::new(),
        files: BTreeSet::from([parts.join("/")]),
    };
    let repair = link_repair::repair_links(repo_root, &config.planning_root, &scope);
    Ok(FixReport {
        file: parts.join("/"),
        links: MoveLinks {
            rewritten: repair.repaired,
            problems: repair.problems,
        },
    })
}

/// Applies `fix`, which the user confirmed, to the repository at `repo_root`. The fix is checked
/// again first and refused when it no longer applies; the file is written against the text read
/// (`R-no-destroy`) and never written over another file.
pub fn apply_fix(repo_root: &Path, config: &Config, fix: &DoctorFix) -> Result<FixReport, String> {
    let file = match fix {
        DoctorFix::SetId { file, .. } | DoctorFix::Rename { file, .. } => file,
        DoctorFix::RepairLinks { file } => return repair_file(repo_root, config, file),
    };
    let parts = components(file);
    let inside = parts.starts_with(&components(&config.planning_root))
        && !parts.iter().any(|part| part == "..")
        && parts.len() > components(&config.planning_root).len();
    if !inside {
        return Err(format!("`{file}` is not a file of the planning root"));
    }
    let path = repo_root.join(file);
    let name = parts.last().cloned().unwrap_or_default();
    let text =
        std::fs::read_to_string(&path).map_err(|err| format!("Cannot read `{file}`: {err}"))?;
    let stale = || format!("`{file}` changed since the check; run the doctor again");

    match fix {
        DoctorFix::SetId { id, .. } => {
            if ids::parse_task_filename(&name)
                .map(|parsed| parsed.id)
                .as_ref()
                != Some(id)
            {
                return Err(stale());
            }
            let new = task::set_field(&text, "id", &FieldValue::Text(id.clone()))?;
            match files::save_text(&path, &text, &new)? {
                SaveOutcome::Saved => Ok(FixReport {
                    file: file.clone(),
                    links: MoveLinks::default(),
                }),
                SaveOutcome::ChangedOnDisk { .. } => Err(stale()),
            }
        }
        DoctorFix::Rename { to, id, .. } => {
            let plain = !to.contains(['/', '\\']) && to != "..";
            if !plain
                || ids::parse_task_filename(to)
                    .map(|parsed| parsed.id)
                    .as_ref()
                    != Some(id)
            {
                return Err(format!("`{to}` is not a task filename with the id `{id}`"));
            }
            let mut problems = Vec::new();
            let taken = task_files(repo_root, config, &mut problems)
                .iter()
                .any(|other| {
                    other.file != *file
                        && ids::parse_task_filename(&other.task.file_name)
                            .is_some_and(|parsed| &parsed.id == id)
                });
            if taken {
                return Err(format!(
                    "another task file has the id `{id}` now; run the doctor again"
                ));
            }
            let target = path.with_file_name(to);
            if target.exists() {
                return Err(format!("a file named `{to}` exists already"));
            }
            let new = task::set_field(&text, "id", &FieldValue::Text(id.clone()))?;
            std::fs::rename(&path, &target)
                .map_err(|err| format!("Cannot rename `{file}`: {err}"))?;
            if new != text {
                let written = files::save_text(&target, &text, &new);
                if !matches!(written, Ok(SaveOutcome::Saved)) {
                    let _ = std::fs::rename(&target, &path);
                    return Err(match written {
                        Err(err) => format!("Cannot write the id of `{to}`: {err}"),
                        _ => stale(),
                    });
                }
            }
            let mut moved = parts.clone();
            *moved.last_mut().expect("a file has a name") = to.clone();
            let moved = moved.join("/");
            let links = links::rewrite_after_moves(
                repo_root,
                &config.planning_root,
                &[Move {
                    from: parts.join("/"),
                    to: moved.clone(),
                }],
            );
            Ok(FixReport { file: moved, links })
        }
        DoctorFix::RepairLinks { .. } => unreachable!("repairs are applied above"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::config;
    use std::path::PathBuf;

    fn scratch() -> (PathBuf, Config) {
        let root = std::env::temp_dir().join(format!("stardust-doctor-{}", ids::random_suffix()));
        for column in ["inbox", "next", "done"] {
            std::fs::create_dir_all(root.join("docs/planning").join(column)).unwrap();
        }
        let config = config::load_config(&root).config;
        (root, config)
    }

    fn put(root: &Path, path: &str, text: &str) {
        let path = root.join(path);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    }

    fn read(root: &Path, path: &str) -> String {
        std::fs::read_to_string(root.join(path)).unwrap()
    }

    const SPEC: &str = "---\ntitle: Specification\n---\n\n# Specification\n\n## Structure\n\n- Area `S-area`\n  - [x] Feature `S-feature`\n    - Does it.\n";

    fn task(id: &str, implements: &str, body: &str) -> String {
        format!(
            "---\nid: {id}\ntitle: Task {id}\ncreated: 2026-10-01\nimplements: [{implements}]\n---\n\n## Description\n{body}\n"
        )
    }

    const A: &str = "20261001-100000-aaaa";
    const B: &str = "20261001-100000-bbbb";
    const C: &str = "20261001-100000-cccc";
    const D: &str = "20261001-100000-dddd";
    const E: &str = "20261001-100000-eeee";
    const F: &str = "20261001-100000-ffff";
    const G: &str = "20261001-100000-gggg";

    fn summary(report: &DoctorReport) -> Vec<(FindingKind, String, u32)> {
        report
            .findings
            .iter()
            .map(|f| (f.kind, f.file.clone(), f.line))
            .collect()
    }

    #[test]
    fn reports_every_kind_with_file_and_line() {
        let (root, config) = scratch();
        let p = "docs/planning";
        put(&root, &format!("{p}/spec.md"), SPEC);
        put(&root, &format!("{p}/braindump.md"), "# Braindump\n");
        put(
            &root,
            &format!("{p}/inbox/{A}-good.md"),
            &task(
                A,
                "S-feature",
                "[spec](../spec.md) [gone](../next/gone.md)\n![shot](../../images/none.png)",
            ),
        );
        put(
            &root,
            &format!("{p}/inbox/loose-note.md"),
            "---\ntitle: Loose note\ncreated: 2026-10-01\nimplements: [S-feature]\n---\n",
        );
        put(
            &root,
            &format!("{p}/next/{B}-mismatch.md"),
            &task(C, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{D}-no-id.md"),
            "---\ntitle: No id\ncreated: 2026-10-01\nimplements: [S-feature]\n---\n",
        );
        put(
            &root,
            &format!("{p}/next/{E}-twice.md"),
            &task(E, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/done/2026-09/{E}-twice.md"),
            &task(E, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{F}-bad-yaml.md"),
            &format!(
                "---\nid: {F}\ntitle: Board: columns\ncreated: 2026-10-01\nimplements: [S-feature]\n---\n"
            ),
        );
        put(
            &root,
            &format!("{p}/next/{G}-untraced.md"),
            &task(G, "", ""),
        );
        put(&root, &format!("{p}/done/{A}x-ignored.md"), "no task");
        put(
            &root,
            &format!("{p}/done/20261001-100000-hhhh-unknown.md"),
            &task("20261001-100000-hhhh", "S-nope", ""),
        );
        // Not planning: template links, and links outside the planning root to other files.
        put(
            &root,
            "docs/templates/task.md",
            "Source: [braindump](../braindump.md)\n",
        );
        put(
            &root,
            "README.md",
            "[docs](docs/other.md)\n[task](docs/planning/next/gone.md)\n",
        );

        let report = doctor(&root, &config);
        let found = summary(&report);
        std::fs::remove_dir_all(&root).unwrap();

        let next = |name: &str| format!("{p}/next/{name}");
        assert_eq!(
            found,
            [
                (
                    FindingKind::DuplicateId,
                    format!("{p}/done/2026-09/{E}-twice.md"),
                    2
                ),
                (FindingKind::DuplicateId, next(&format!("{E}-twice.md")), 2),
                (
                    FindingKind::MissingId,
                    format!("{p}/done/{A}x-ignored.md"),
                    1
                ),
                (
                    FindingKind::MissingId,
                    format!("{p}/inbox/loose-note.md"),
                    1
                ),
                (FindingKind::MissingId, next(&format!("{D}-no-id.md")), 1),
                (
                    FindingKind::IdMismatch,
                    next(&format!("{B}-mismatch.md")),
                    2
                ),
                (FindingKind::BrokenLink, "README.md".into(), 2),
                (FindingKind::BrokenLink, format!("{p}/inbox/{A}-good.md"), 9),
                (
                    FindingKind::MissingImage,
                    format!("{p}/inbox/{A}-good.md"),
                    10
                ),
                (
                    FindingKind::FrontmatterError,
                    format!("{p}/done/{A}x-ignored.md"),
                    1
                ),
                (
                    FindingKind::FrontmatterError,
                    format!("{p}/done/{A}x-ignored.md"),
                    1
                ),
                (
                    FindingKind::FrontmatterError,
                    format!("{p}/done/{A}x-ignored.md"),
                    1
                ),
                (
                    FindingKind::FrontmatterError,
                    next(&format!("{F}-bad-yaml.md")),
                    1
                ),
                (
                    FindingKind::Untraced,
                    format!("{p}/done/20261001-100000-hhhh-unknown.md"),
                    5
                ),
                (FindingKind::Untraced, next(&format!("{G}-untraced.md")), 5),
            ]
        );
        assert_eq!(report.task_files, 10);
        assert!(report.problems.is_empty());
    }

    #[test]
    fn offers_the_obvious_fixes_only() {
        let (root, config) = scratch();
        let p = "docs/planning";
        put(&root, &format!("{p}/spec.md"), SPEC);
        put(
            &root,
            &format!("{p}/next/{B}-mismatch.md"),
            &task(C, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{D}-no-id.md"),
            "---\ntitle: No id\ncreated: 2026-10-01\nimplements: [S-feature]\n---\n",
        );
        put(
            &root,
            &format!("{p}/inbox/Loose Note.md"),
            &task(A, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{E}-twice.md"),
            &task(E, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/done/{E}-twice.md"),
            &task(E, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{G}-untraced.md"),
            &task(G, "", "[x](gone.md)"),
        );

        let report = doctor(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        let fix_of = |file: &str, kind: FindingKind| {
            report
                .findings
                .iter()
                .find(|f| f.kind == kind && f.file.ends_with(file))
                .unwrap_or_else(|| panic!("no {kind:?} for {file}"))
                .fix
                .clone()
        };
        assert_eq!(
            fix_of("mismatch.md", FindingKind::IdMismatch),
            Some(DoctorFix::SetId {
                file: format!("{p}/next/{B}-mismatch.md"),
                id: B.into()
            })
        );
        assert_eq!(
            fix_of("no-id.md", FindingKind::MissingId),
            Some(DoctorFix::SetId {
                file: format!("{p}/next/{D}-no-id.md"),
                id: D.into()
            })
        );
        // The frontmatter id is unique, so the file is renamed to it with a slug of its title.
        assert_eq!(
            fix_of("Loose Note.md", FindingKind::MissingId),
            Some(DoctorFix::Rename {
                file: format!("{p}/inbox/Loose Note.md"),
                to: format!("{A}-task-{A}.md"),
                id: A.into()
            })
        );
        // Each copy of a duplicate is offered a new id; the user picks which one moves.
        let renames: Vec<DoctorFix> = report
            .findings
            .iter()
            .filter(|f| f.kind == FindingKind::DuplicateId)
            .filter_map(|f| f.fix.clone())
            .collect();
        assert_eq!(renames.len(), 2);
        for fix in &renames {
            let DoctorFix::Rename { to, id, .. } = fix else {
                panic!("{fix:?}")
            };
            assert_ne!(id, E);
            assert_eq!(to, &format!("{id}-twice.md"));
        }
        assert!(
            report
                .findings
                .iter()
                .filter(|f| matches!(f.kind, FindingKind::Untraced | FindingKind::BrokenLink))
                .all(|f| f.fix.is_none())
        );
    }

    #[test]
    fn set_id_writes_the_filename_id_and_only_that_line() {
        let (root, config) = scratch();
        let file = format!("docs/planning/next/{B}-mismatch.md");
        let text =
            format!("---\n# keep\nid: {C}\ntitle: \"A: b\"\ncreated: 2026-10-01\n---\n\nBody\n");
        put(&root, &file, &text);
        let fix = DoctorFix::SetId {
            file: file.clone(),
            id: B.into(),
        };
        let report = apply_fix(&root, &config, &fix).unwrap();
        let written = read(&root, &file);
        let again = doctor(&root, &config);
        // A fix that no longer applies is refused.
        let wrong = apply_fix(
            &root,
            &config,
            &DoctorFix::SetId {
                file: file.clone(),
                id: C.into(),
            },
        );
        let outside = apply_fix(
            &root,
            &config,
            &DoctorFix::SetId {
                file: "README.md".into(),
                id: B.into(),
            },
        );
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.file, file);
        assert_eq!(
            written,
            text.replace(&format!("id: {C}"), &format!("id: {B}"))
        );
        assert!(
            again
                .findings
                .iter()
                .all(|f| f.kind != FindingKind::IdMismatch)
        );
        assert!(wrong.is_err());
        assert!(outside.is_err());
    }

    #[test]
    fn rename_gives_a_new_id_and_links_follow_the_file() {
        let (root, config) = scratch();
        let p = "docs/planning";
        put(&root, &format!("{p}/spec.md"), SPEC);
        put(
            &root,
            &format!("{p}/next/{E}-twice.md"),
            &task(E, "S-feature", "[a](../done/x.md)"),
        );
        put(
            &root,
            &format!("{p}/done/{E}-twice.md"),
            &task(E, "S-feature", ""),
        );
        put(
            &root,
            &format!("{p}/next/{A}-linking.md"),
            &task(A, "S-feature", &format!("[twice](../done/{E}-twice.md)")),
        );
        put(&root, &format!("{p}/done/x.md"), "x");
        let report = doctor(&root, &config);
        let fix = report
            .findings
            .iter()
            .find(|f| f.kind == FindingKind::DuplicateId && f.file.contains("/done/"))
            .and_then(|f| f.fix.clone())
            .unwrap();
        let DoctorFix::Rename { to, id, .. } = &fix else {
            panic!("{fix:?}")
        };
        let applied = apply_fix(&root, &config, &fix).unwrap();
        let moved = read(&root, &format!("{p}/done/{to}"));
        let linking = read(&root, &format!("{p}/next/{A}-linking.md"));
        let gone = root.join(format!("{p}/done/{E}-twice.md")).exists();
        let again = apply_fix(&root, &config, &fix);
        let after = doctor(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(applied.file, format!("{p}/done/{to}"));
        assert!(moved.contains(&format!("id: {id}\n")));
        assert!(linking.contains(&format!("[twice](../done/{to})")));
        assert_eq!(applied.links.rewritten.len(), 1);
        assert!(!gone);
        assert!(again.is_err(), "the old file is gone");
        assert!(
            after
                .findings
                .iter()
                .all(|f| f.kind != FindingKind::DuplicateId),
            "{:?}",
            after.findings
        );
    }

    #[test]
    fn rename_never_writes_over_a_file() {
        let (root, config) = scratch();
        let file = "docs/planning/inbox/loose.md";
        put(&root, file, "---\ntitle: Loose\ncreated: 2026-10-01\n---\n");
        put(
            &root,
            &format!("docs/planning/inbox/{A}-loose.md"),
            "taken name",
        );
        let fix = DoctorFix::Rename {
            file: file.into(),
            to: format!("{A}-loose.md"),
            id: A.into(),
        };
        let result = apply_fix(&root, &config, &fix);
        let kept = read(&root, &format!("docs/planning/inbox/{A}-loose.md"));
        let still = root.join(file).exists();
        std::fs::remove_dir_all(&root).unwrap();

        assert!(result.is_err());
        assert_eq!(kept, "taken name");
        assert!(still);
    }

    /// Runs git for a test fixture; `None` when git is not installed.
    fn fixture_git(root: &Path, args: &[&str]) -> Option<()> {
        let status = std::process::Command::new("git")
            .arg("-C")
            .arg(root)
            .args([
                "-c",
                "commit.gpgsign=false",
                "-c",
                "init.defaultBranch=main",
            ])
            .args(args)
            .env("GIT_AUTHOR_NAME", "Test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "Test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .ok()?;
        assert!(status.success(), "git {args:?} failed");
        Some(())
    }

    /// Phase 3 exit test (`S-doctor`): a project made by the app's own functions, with 240 task
    /// files across the columns, an archive of two months and a merged branch, has no findings.
    /// Every move is followed by the link rewrite the watcher runs for it.
    #[test]
    fn phase_3_exit_zero_findings_on_a_generated_project() {
        use crate::domain::{archive, board, init, make_task};

        let root = std::env::temp_dir().join(format!("stardust-exit-{}", ids::random_suffix()));
        std::fs::create_dir_all(&root).unwrap();
        let git = |args: &[&str]| fixture_git(&root, args);
        let has_git = git(&["init", "-q"]).is_some();
        init::init_project(&root).unwrap();
        let config = config::load_config(&root).config;
        let planning = root.join(&config.planning_root);
        let braindump = planning.join("braindump.md");
        put(&root, "docs/images/shot.png", "not really a png");
        let now = chrono::Local::now().date_naive();
        let today = now.format("%Y-%m-%d").to_string();

        // A task in the first column linking to the spec, to the task made before it and,
        // every tenth, to an image.
        let make = |n: usize, previous: Option<&str>| -> String {
            let path = make_task::make_task(
                &root,
                &config,
                &braindump,
                &format!("Generated task {n}"),
                &today,
            )
            .unwrap();
            let text = std::fs::read_to_string(&path).unwrap();
            let mut text = task::set_field(
                &text,
                "implements",
                &FieldValue::List(vec!["S-feature".into()]),
            )
            .unwrap();
            text.push_str("\nSee the [spec](../spec.md).\n");
            if let Some(previous) = previous {
                text.push_str(&format!("After [the task before]({previous}).\n"));
            }
            if n.is_multiple_of(10) {
                text.push_str("![shot](../../images/shot.png)\n");
            }
            std::fs::write(&path, text).unwrap();
            path.file_name().unwrap().to_string_lossy().into_owned()
        };
        let make_many = |range: std::ops::Range<usize>| -> Vec<String> {
            let mut names: Vec<String> = Vec::new();
            for n in range {
                let name = make(n, names.last().map(String::as_str));
                names.push(name);
            }
            names
        };
        let follow = |moves: Vec<Move>| {
            let report = links::rewrite_after_moves(&root, &config.planning_root, &moves);
            assert!(report.problems.is_empty(), "{:?}", report.problems);
        };

        let names = make_many(0..200);
        let column = |name: &str| format!("{}/{name}", config.planning_root);
        let mut moves = Vec::new();
        for (n, name) in names.iter().enumerate().take(140) {
            let to = if n < 80 { "done" } else { "next" };
            board::move_task(&root, &config, name, "inbox", to, &today).unwrap();
            moves.push(Move {
                from: column(&format!("inbox/{name}")),
                to: column(&format!("{to}/{name}")),
            });
            if n < 60 {
                let days_back = if n < 30 { 35 } else { 100 };
                let completed = (now - chrono::Duration::days(days_back))
                    .format("%Y-%m-%d")
                    .to_string();
                let path = planning.join(to).join(name);
                let text = std::fs::read_to_string(&path).unwrap();
                let text =
                    task::set_field(&text, "completed", &FieldValue::Text(completed)).unwrap();
                std::fs::write(&path, text).unwrap();
            }
        }
        follow(moves);

        let plan = archive::plan_archive(&root, &config, &today);
        let expected: Vec<String> = plan.moves.iter().map(|m| m.file_name.clone()).collect();
        let archived = archive::archive(&root, &config, &today, &expected).unwrap();
        assert_eq!(archived.moved.len(), 60);
        assert!(archived.failed.is_empty());
        follow(
            archived
                .moved
                .iter()
                .map(|m| Move {
                    from: m.from.clone(),
                    to: m.to.clone(),
                })
                .collect(),
        );

        if has_git {
            git(&["add", "-A"]);
            git(&["commit", "-q", "-m", "Generated project"]);
            git(&["checkout", "-q", "-b", "feature"]);
            make_many(200..220);
            git(&["add", "-A"]);
            git(&["commit", "-q", "-m", "Tasks on a branch"]);
            git(&["checkout", "-q", "main"]);
            make_many(220..240);
            git(&["add", "-A"]);
            git(&["commit", "-q", "-m", "Tasks on main"]);
            git(&["merge", "-q", "--no-edit", "feature"]);
        } else {
            eprintln!("git not installed; the merged branch was skipped");
            make_many(200..240);
        }

        let report = doctor(&root, &config);
        let months: Vec<String> = std::fs::read_dir(planning.join("done"))
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().unwrap().is_dir())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.findings, [], "{:#?}", report.findings);
        assert!(report.problems.is_empty(), "{:?}", report.problems);
        assert_eq!(report.task_files, 240);
        assert_eq!(months.len(), 2, "{months:?}");
        assert!(months.iter().all(|month| is_month(month)), "{months:?}");
    }

    #[test]
    fn a_link_repairable_by_id_is_listed_with_the_repair_as_its_fix() {
        let (root, config) = scratch();
        let p = "docs/planning";
        put(&root, &format!("{p}/spec.md"), SPEC);
        put(
            &root,
            &format!("{p}/done/2026-09/{B}-renamed.md"),
            &task(B, "S-feature", ""),
        );
        let file = format!("{p}/next/{A}-linking.md");
        put(
            &root,
            &file,
            &task(A, "S-feature", &format!("[b](../next/{B}-old.md)")),
        );
        let report = doctor(&root, &config);
        let applied = report.findings[0]
            .fix
            .as_ref()
            .map(|fix| apply_fix(&root, &config, fix));
        let linking = read(&root, &file);
        let after = doctor(&root, &config);
        std::fs::remove_dir_all(&root).unwrap();

        assert_eq!(report.findings.len(), 1, "{:?}", report.findings);
        assert_eq!(report.findings[0].kind, FindingKind::BrokenLink);
        assert_eq!(report.findings[0].line, 9);
        assert_eq!(
            report.findings[0].fix,
            Some(DoctorFix::RepairLinks { file: file.clone() })
        );
        let applied = applied.unwrap().unwrap();
        assert_eq!(applied.links.rewritten.len(), 1);
        assert!(linking.contains(&format!("[b](../done/2026-09/{B}-renamed.md)")));
        assert_eq!(after.findings, []);
    }

    #[test]
    fn field_lines_are_found_in_the_frontmatter_only() {
        let text = "---\ntitle: x\nid: y\n---\nid: z\n";
        assert_eq!(field_line(Some(text), "id"), 3);
        assert_eq!(field_line(Some(text), "implements"), 1);
        assert_eq!(field_line(Some("id: y\n"), "id"), 1);
        assert_eq!(field_line(None, "id"), 1);
        assert!(is_month("2026-09"));
        assert!(!is_month("2026-9x"));
        assert!(!is_month("notes"));
    }
}
