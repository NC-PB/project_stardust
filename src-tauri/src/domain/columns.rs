//! The roles of the configured columns, as the planner block (`S-agents-block`) and the prompts
//! (`S-prompts`) name them: where new tasks go, which tasks are ready, which are finished.

use super::config::Config;

/// The column of each role. Counted without the terminal column: new is the first column,
/// ready the second; with a single column before the terminal it is both.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnRoles {
    pub new: String,
    pub ready: String,
    pub terminal: String,
}

pub fn column_roles(config: &Config) -> ColumnRoles {
    let mut open = config
        .columns
        .iter()
        .filter(|column| **column != config.terminal);
    let new = open.next().unwrap_or(&config.terminal).clone();
    let ready = open.next().unwrap_or(&new).clone();
    ColumnRoles {
        new,
        ready,
        terminal: config.terminal.clone(),
    }
}

/// Every column in config order as `` `name/` (role) ``; columns without a role are listed bare.
/// With the default config: `` `inbox/` (new), `next/` (ready for you), `done/` (finished) ``.
pub fn columns_line(config: &Config) -> String {
    let roles = column_roles(config);
    config
        .columns
        .iter()
        .map(|column| {
            let mut names = Vec::new();
            if *column == roles.terminal {
                names.push("finished");
            } else {
                if *column == roles.new {
                    names.push("new");
                }
                if *column == roles.ready {
                    names.push("ready for you");
                }
            }
            if names.is_empty() {
                format!("`{column}/`")
            } else {
                format!("`{column}/` ({})", names.join(", "))
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// `text` with `{columns}`, `{new_column}`, `{ready_column}` and `{terminal_column}` filled.
pub fn fill_columns(text: &str, config: &Config) -> String {
    let roles = column_roles(config);
    text.replace("{columns}", &columns_line(config))
        .replace("{new_column}", &roles.new)
        .replace("{ready_column}", &roles.ready)
        .replace("{terminal_column}", &roles.terminal)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(columns: &[&str], terminal: &str) -> Config {
        Config {
            columns: columns.iter().map(|column| column.to_string()).collect(),
            terminal: terminal.to_string(),
            ..Config::default()
        }
    }

    #[test]
    fn the_default_columns_keep_their_wording() {
        let config = Config::default();
        assert_eq!(
            columns_line(&config),
            "`inbox/` (new), `next/` (ready for you), `done/` (finished)"
        );
        assert_eq!(
            fill_columns("{new_column} {ready_column} {terminal_column}", &config),
            "inbox next done"
        );
    }

    #[test]
    fn other_columns_get_roles_by_position() {
        let config = config(
            &["backlog", "todo", "doing", "review", "shipped"],
            "shipped",
        );
        assert_eq!(
            column_roles(&config),
            ColumnRoles {
                new: "backlog".into(),
                ready: "todo".into(),
                terminal: "shipped".into(),
            }
        );
        assert_eq!(
            columns_line(&config),
            "`backlog/` (new), `todo/` (ready for you), `doing/`, `review/`, `shipped/` (finished)"
        );
    }

    #[test]
    fn the_terminal_column_does_not_count_wherever_it_is() {
        let config = config(&["done", "inbox", "next"], "done");
        assert_eq!(column_roles(&config).new, "inbox");
        assert_eq!(column_roles(&config).ready, "next");
    }

    #[test]
    fn one_open_column_is_new_and_ready() {
        let config = config(&["todo", "done"], "done");
        assert_eq!(
            columns_line(&config),
            "`todo/` (new, ready for you), `done/` (finished)"
        );
        let only = config_with_only_terminal();
        assert_eq!(column_roles(&only).new, "done");
        assert_eq!(columns_line(&only), "`done/` (finished)");
    }

    fn config_with_only_terminal() -> Config {
        config(&["done"], "done")
    }
}
