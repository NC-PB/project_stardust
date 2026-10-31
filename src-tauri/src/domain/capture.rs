//! Quick capture (`S-quick-capture`): a line typed in the capture window is appended to the
//! braindump of the chosen project, written against the text just read so a change made on
//! disk meanwhile is never overwritten (`S-conflicts`).

use std::path::{Path, PathBuf};

use crate::domain::config::Config;
use crate::domain::files::{self, SaveOutcome};

/// How often the append reads the braindump again when it changed between read and write.
const ATTEMPTS: usize = 3;

/// The captured text as one line: runs of whitespace, line breaks included, become one space.
/// `None` when nothing but whitespace was typed.
pub fn capture_line(text: &str) -> Option<String> {
    let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!line.is_empty()).then_some(line)
}

/// Whether `line` is a list item without text, such as the `- ` the braindump template ends
/// with.
fn is_empty_item(line: &str) -> bool {
    matches!(line.trim_end(), "-" | "*" | "+")
}

/// `text` with `line` added as a list item at its end. An empty list item on the last line,
/// such as the template's `- `, takes the line instead of staying above it; no other text
/// changes. The result ends with a line break.
pub fn append_line(text: &str, line: &str) -> String {
    let item = format!("- {line}\n");
    let body = text.strip_suffix('\n').unwrap_or(text);
    let last_start = body.rfind('\n').map_or(0, |index| index + 1);
    if is_empty_item(&body[last_start..]) {
        return format!("{}{item}", &body[..last_start]);
    }
    if text.is_empty() || text.ends_with('\n') {
        format!("{text}{item}")
    } else {
        format!("{text}\n{item}")
    }
}

/// The braindump of a project: `{planning_root}/braindump.md`.
pub fn braindump_path(repo_root: &Path, config: &Config) -> PathBuf {
    repo_root.join(&config.planning_root).join("braindump.md")
}

/// Appends `text`, as one line, to the braindump of the project at `repo_root`. Writes only
/// over the text it read; when the file changed in between it reads again, a few times. Never
/// creates the braindump. Returns its path.
pub fn append_to_braindump(
    repo_root: &Path,
    config: &Config,
    text: &str,
) -> Result<PathBuf, String> {
    let line = capture_line(text).ok_or("nothing to capture")?;
    let path = braindump_path(repo_root, config);
    if !path.is_file() {
        return Err(format!(
            "no braindump at {}/braindump.md; initialize the project first",
            config.planning_root
        ));
    }
    for _ in 0..ATTEMPTS {
        let read = files::read_text(&path)?;
        match files::save_text(&path, &read, &append_line(&read, &line))? {
            SaveOutcome::Saved => return Ok(path),
            SaveOutcome::ChangedOnDisk { .. } => continue,
        }
    }
    Err("the braindump kept changing while the line was written; try again".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_repo(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("stardust-capture-{name}-{}", fastrand::u32(..)));
        std::fs::create_dir_all(dir.join("docs/planning")).unwrap();
        dir
    }

    #[test]
    fn a_capture_is_one_line_without_outer_whitespace() {
        assert_eq!(
            capture_line("  an idea \n with\ttwo lines "),
            Some("an idea with two lines".into())
        );
        assert_eq!(capture_line(" \n\t "), None);
        assert_eq!(capture_line(""), None);
    }

    #[test]
    fn appends_a_list_item_at_the_end() {
        assert_eq!(
            append_line("# B\n\n- one\n", "two"),
            "# B\n\n- one\n- two\n"
        );
        assert_eq!(append_line("# B\n\n- one", "two"), "# B\n\n- one\n- two\n");
        assert_eq!(append_line("", "two"), "- two\n");
        assert_eq!(
            append_line("# B\r\n- one\r\n", "two"),
            "# B\r\n- one\r\n- two\n"
        );
    }

    #[test]
    fn fills_an_empty_list_item_on_the_last_line() {
        assert_eq!(append_line("# B\n\n- \n", "two"), "# B\n\n- two\n");
        assert_eq!(append_line("# B\n\n-", "two"), "# B\n\n- two\n");
        assert_eq!(append_line("- ", "two"), "- two\n");
        // An empty item above other text stays.
        assert_eq!(append_line("- \ntext\n", "two"), "- \ntext\n- two\n");
        // A blank last line is no list item.
        assert_eq!(append_line("- one\n\n", "two"), "- one\n\n- two\n");
    }

    #[test]
    fn appends_to_the_braindump_of_the_planning_root() {
        let repo = temp_repo("append");
        let braindump = repo.join("docs/planning/braindump.md");
        std::fs::write(&braindump, "# Braindump\n\n- \n").unwrap();
        let config = Config::default();
        let path = append_to_braindump(&repo, &config, "first idea").unwrap();
        assert_eq!(path, braindump);
        append_to_braindump(&repo, &config, " second\nidea ").unwrap();
        assert_eq!(
            std::fs::read_to_string(&braindump).unwrap(),
            "# Braindump\n\n- first idea\n- second idea\n"
        );
    }

    #[test]
    fn refuses_empty_text_and_a_missing_braindump() {
        let repo = temp_repo("missing");
        let config = Config::default();
        assert_eq!(
            append_to_braindump(&repo, &config, "idea"),
            Err("no braindump at docs/planning/braindump.md; initialize the project first".into())
        );
        assert!(!repo.join("docs/planning/braindump.md").exists());
        std::fs::write(repo.join("docs/planning/braindump.md"), "x\n").unwrap();
        assert_eq!(
            append_to_braindump(&repo, &config, "  "),
            Err("nothing to capture".into())
        );
        assert_eq!(
            std::fs::read_to_string(repo.join("docs/planning/braindump.md")).unwrap(),
            "x\n"
        );
    }
}
