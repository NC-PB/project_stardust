//! Open terminal (`S-terminal`): starts the user's terminal in the repository root and
//! nothing else. Only the terminal program runs; no command is passed to it.

use std::io::ErrorKind;
use std::path::Path;
use std::process::{Command, Stdio};

/// The platforms the app ships for, as far as starting a terminal differs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    Windows,
    Linux,
}

impl Platform {
    pub fn current() -> Platform {
        if cfg!(target_os = "macos") {
            Platform::MacOs
        } else if cfg!(target_os = "windows") {
            Platform::Windows
        } else {
            Platform::Linux
        }
    }
}

/// One way to start a terminal: `program` with `args`, started in the repository root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub program: String,
    pub args: Vec<String>,
    /// Windows: the program needs a console window of its own.
    pub new_console: bool,
}

impl Launch {
    fn new(program: &str, args: &[&str]) -> Launch {
        Launch {
            program: program.to_string(),
            args: args.iter().map(|arg| arg.to_string()).collect(),
            new_console: false,
        }
    }
}

/// Terminals tried on Linux after the configured one, in order.
const LINUX_TERMINALS: [&str; 9] = [
    "x-terminal-emulator",
    "gnome-terminal",
    "konsole",
    "xfce4-terminal",
    "kitty",
    "alacritty",
    "wezterm",
    "foot",
    "xterm",
];

/// The ways to start a terminal in `dir`, tried in order until one starts. `configured` is
/// the terminal from the app settings: an application name on macOS, a program elsewhere.
pub fn launches(platform: Platform, configured: Option<&str>, dir: &str) -> Vec<Launch> {
    let configured = configured.map(str::trim).filter(|value| !value.is_empty());
    match platform {
        Platform::MacOs => {
            vec![Launch::new(
                "open",
                &["-a", configured.unwrap_or("Terminal"), dir],
            )]
        }
        Platform::Windows => {
            let mut list = Vec::new();
            if let Some(program) = configured {
                list.push(with_directory(program, dir, true));
            }
            list.push(Launch::new("wt.exe", &["-d", dir]));
            list.push(Launch {
                new_console: true,
                ..Launch::new("cmd.exe", &[])
            });
            list
        }
        Platform::Linux => configured
            .into_iter()
            .chain(LINUX_TERMINALS)
            .map(|program| with_directory(program, dir, false))
            .collect(),
    }
}

/// `program` with the working directory flag it is known to need; other programs start in
/// `dir` as their working directory, in a console of their own on Windows.
fn with_directory(program: &str, dir: &str, windows: bool) -> Launch {
    let name = Path::new(program)
        .file_stem()
        .map(|stem| stem.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match name.as_str() {
        "gnome-terminal" | "xfce4-terminal" | "alacritty" | "mate-terminal" | "tilix" => {
            Launch::new(program, &[&format!("--working-directory={dir}")])
        }
        "konsole" => Launch::new(program, &["--workdir", dir]),
        "kitty" => Launch::new(program, &["--directory", dir]),
        "wezterm" => Launch::new(program, &["start", "--cwd", dir]),
        "wt" => Launch::new(program, &["-d", dir]),
        _ => Launch {
            new_console: windows,
            ..Launch::new(program, &[])
        },
    }
}

/// Starts the first of `launches` that exists, in `dir`, without waiting for it. Returns the
/// program that started.
pub fn open_terminal(launches: &[Launch], dir: &Path) -> Result<String, String> {
    if !dir.is_dir() {
        return Err(format!("{} is not a folder", dir.display()));
    }
    let mut tried = Vec::new();
    for launch in launches {
        let mut command = Command::new(&launch.program);
        command
            .args(&launch.args)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        if launch.new_console {
            use std::os::windows::process::CommandExt;
            const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
            command.creation_flags(CREATE_NEW_CONSOLE);
        }
        match command.spawn() {
            Ok(mut child) => {
                // Reaped in the background; the terminal outlives the wait if it keeps running.
                std::thread::spawn(move || child.wait());
                return Ok(launch.program.clone());
            }
            Err(err) if err.kind() == ErrorKind::NotFound => tried.push(launch.program.clone()),
            Err(err) => return Err(format!("{}: {err}", launch.program)),
        }
    }
    Err(format!("no terminal found; tried {}", tried.join(", ")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn programs(list: &[Launch]) -> Vec<&str> {
        list.iter().map(|launch| launch.program.as_str()).collect()
    }

    #[test]
    fn macos_opens_terminal_or_the_configured_app() {
        assert_eq!(
            launches(Platform::MacOs, None, "/r"),
            [Launch::new("open", &["-a", "Terminal", "/r"])]
        );
        assert_eq!(
            launches(Platform::MacOs, Some(" iTerm "), "/r"),
            [Launch::new("open", &["-a", "iTerm", "/r"])]
        );
        assert_eq!(
            launches(Platform::MacOs, Some(""), "/r")[0].args[1],
            "Terminal"
        );
    }

    #[test]
    fn windows_tries_the_configured_program_then_windows_terminal_then_cmd() {
        let list = launches(Platform::Windows, Some("pwsh.exe"), "C:\\r");
        assert_eq!(programs(&list), ["pwsh.exe", "wt.exe", "cmd.exe"]);
        assert!(list[0].new_console && list[0].args.is_empty());
        assert_eq!(list[1].args, ["-d", "C:\\r"]);
        assert!(list[2].new_console);
    }

    #[test]
    fn linux_passes_the_working_directory_where_needed() {
        let list = launches(Platform::Linux, Some("/usr/bin/gnome-terminal"), "/r");
        assert_eq!(list[0].args, ["--working-directory=/r"]);
        assert_eq!(list[1].program, "x-terminal-emulator");
        assert!(list[1].args.is_empty());
        assert_eq!(list.len(), 1 + LINUX_TERMINALS.len());
        let konsole = list
            .iter()
            .find(|launch| launch.program == "konsole")
            .unwrap();
        assert_eq!(konsole.args, ["--workdir", "/r"]);
        assert!(list.iter().all(|launch| !launch.new_console));
    }

    #[test]
    fn missing_programs_are_skipped_and_reported() {
        let dir = std::env::temp_dir();
        let missing = Launch::new("stardust-no-such-terminal", &[]);
        let err = open_terminal(&[missing.clone(), missing], &dir).unwrap_err();
        assert!(
            err.contains("no terminal found; tried stardust-no-such-terminal"),
            "{err}"
        );
        assert!(open_terminal(&[], &dir.join("stardust-missing-dir")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn starts_the_first_program_that_exists_in_the_folder() {
        let dir = std::env::temp_dir();
        let started = open_terminal(
            &[
                Launch::new("stardust-no-such-terminal", &[]),
                Launch::new("true", &[]),
            ],
            &dir,
        );
        assert_eq!(started, Ok("true".to_string()));
    }
}
