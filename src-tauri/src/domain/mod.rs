//! Domain logic: plain Rust with no Tauri dependency, tested with `cargo test`.
//! Planning modules (ids, task files, config, ...) live here as their tasks land.

pub mod adapters;
pub mod agents_block;
pub mod append_only;
pub mod board;
pub mod columns;
pub mod config;
pub mod files;
pub mod gate;
pub mod gitattributes;
pub mod ids;
pub mod init;
pub mod make_task;
pub mod prompts;
pub mod proposals;
pub mod questions;
pub mod search;
pub mod spec;
pub mod spec_split;
pub mod task;
pub mod templates;
pub mod terminal;
pub mod watch;

/// Version of the app as set in `Cargo.toml`.
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_version_matches_cargo_manifest() {
        assert_eq!(app_version(), "0.1.0");
    }
}
