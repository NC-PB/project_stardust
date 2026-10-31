//! Read-only git (`R-no-git-writes`): the one place the app runs git, and only `git log`.
//! Used by the changelog draft (`S-changelog`) and commit info (`S-commit-info`).

use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Stdio};

/// Runs `git log` with `args` in `repo_root` and returns its output. `log` is added here, so
/// no other git command can run. Without git, or outside a repository, the error says why.
pub fn log(repo_root: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo_root)
        .arg("log")
        .args(args)
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output().map_err(|err| match err.kind() {
        ErrorKind::NotFound => "git was not found".to_string(),
        _ => format!("git could not run: {err}"),
    })?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let first = stderr.lines().next().unwrap_or("").trim();
        let first = first.strip_prefix("fatal: ").unwrap_or(first);
        return Err(if first.is_empty() {
            "git log failed".to_string()
        } else {
            first.to_string()
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
