//! Domain logic: plain Rust with no Tauri dependency, tested with `cargo test`.
//! Planning modules (ids, task files, config, ...) live here as their tasks land.

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
