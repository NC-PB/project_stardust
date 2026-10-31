//! Domain logic: plain Rust with no Tauri dependency, tested with `cargo test`.
//! Planning modules (ids, task files, config, ...) live here as their tasks land.

pub mod adapters;
pub mod agents_block;
pub mod append_only;
pub mod archive;
pub mod board;
pub mod capture;
pub mod changelog;
pub mod code_paths;
pub mod columns;
pub mod commit_info;
pub mod config;
pub mod doctor;
pub mod files;
pub mod gate;
pub mod git;
pub mod gitattributes;
pub mod ids;
pub mod images;
pub mod init;
pub mod link_lookup;
pub mod link_repair;
pub mod links;
pub mod make_task;
pub mod prompts;
pub mod proposals;
pub mod questions;
pub mod repo_watch;
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
