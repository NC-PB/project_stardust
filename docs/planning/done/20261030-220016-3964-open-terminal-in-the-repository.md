---
id: 20261030-220016-3964
title: Open terminal in the repository
tags: [agents]
created: 2026-10-30
completed: 2026-10-31
implements: [S-terminal]
depends_on: [20261030-220000-0822]
---

## Description
Implements `S-terminal` in the [spec](../spec.md).

## Acceptance criteria
- [x] Opens the user's terminal in the repository root on macOS, Windows and Linux
- [x] The terminal application is configurable in app settings
- [x] Nothing else is run

## Implementation notes
- Plan: Rust `domain/terminal.rs` lists the launch candidates per platform (pure, tested), a command spawns the first one that exists with `std::process::Command`, detached, nothing run inside it. macOS `open -a <app> <repo>` (Terminal by default); Windows `wt -d <repo>`, then a new `cmd` console; Linux the configured program, `x-terminal-emulator`, then common terminals with their working directory flag. The terminal setting (app name or program) is in the app settings, edited in a Settings disclosure in the header; an "Open terminal" button in the project bar. No `tauri-plugin-shell`: one fixed command in Rust needs no frontend shell permissions.
- Done: `domain/terminal.rs` (`Platform`, `launches`, `open_terminal`), command `open_terminal`; `stores/terminal-store.ts`; `components/settings-menu.tsx` (terminal field, theme switch) in the header; "Open terminal" in the project bar with its error.
- Windows code type-checked with `rustc --target x86_64-pc-windows-msvc` on `terminal.rs` alone (the crate's Windows build script needs Windows tools). Linux lists checked by unit tests only.
- Decision D-20261031-003519-cfn5.
- Checks: `cargo test` (121), `cargo clippy` clean, `npm run check` (100). No terminal was started by hand.

## Result
"Open terminal" in the project bar starts the user's terminal in the repository root and nothing else. On macOS that is Terminal or the application set in the new Settings menu of the header; on Windows the set program, Windows Terminal or a `cmd` console; on Linux the set program, `x-terminal-emulator` or the first common terminal found, each opened in the repository root. If no terminal starts, the error says which ones were tried.

- Not tried by hand on any platform; Windows and Linux only through tests and a Windows type check.
- The Settings menu now also holds the theme switch.

### Next session
- `next/` is empty. The last phase 1 task in the inbox is [deletes to the OS trash](../inbox/20261030-220017-e886-deletes-go-to-the-os-trash.md); the app deletes nothing yet.
