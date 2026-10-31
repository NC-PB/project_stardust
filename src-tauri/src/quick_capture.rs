//! The quick capture window and its global hotkey (`S-quick-capture`). The hotkey is
//! registered with `tauri-plugin-global-shortcut` from Rust, so the webviews need no
//! permission for it. It works only while the app runs: nothing is left registered when the
//! app is closed.

use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// The label of the capture window; the frontend renders the capture form in it.
pub const CAPTURE_LABEL: &str = "capture";
/// The label of the app's main window; closing it quits the app, capture window included.
pub const MAIN_LABEL: &str = "main";

/// The hotkey registered now, if any.
#[derive(Default)]
pub struct HotkeyState(Mutex<Option<Shortcut>>);

/// `hotkey` as a shortcut, such as `CommandOrControl+Shift+Space`.
pub fn parse_hotkey(hotkey: &str) -> Result<Shortcut, String> {
    Shortcut::from_str(hotkey.trim())
        .map_err(|err| format!("\"{}\" is not a hotkey: {err}", hotkey.trim()))
}

/// Shows the capture window and gives it the focus, creating it on first use.
pub fn show_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = match app.get_webview_window(CAPTURE_LABEL) {
        Some(window) => window,
        None => WebviewWindowBuilder::new(app, CAPTURE_LABEL, WebviewUrl::App("index.html".into()))
            .title("Quick capture")
            .inner_size(480.0, 150.0)
            .resizable(false)
            .minimizable(false)
            .maximizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .center()
            .build()
            .map_err(|err| err.to_string())?,
    };
    let _ = window.unminimize();
    window.show().map_err(|err| err.to_string())?;
    window.set_focus().map_err(|err| err.to_string())
}

/// Replaces the registered hotkey with `hotkey`; empty turns quick capture's hotkey off.
/// Returns the hotkey as registered. A hotkey the system refuses, for example one another app
/// holds, is an error, and then no hotkey is registered.
pub fn set_hotkey<R: Runtime>(
    app: &AppHandle<R>,
    state: &HotkeyState,
    hotkey: &str,
) -> Result<String, String> {
    let wanted = if hotkey.trim().is_empty() {
        None
    } else {
        Some(parse_hotkey(hotkey)?)
    };
    let mut current = state.0.lock().map_err(|err| err.to_string())?;
    if *current == wanted {
        return Ok(wanted
            .map(|shortcut| shortcut.into_string())
            .unwrap_or_default());
    }
    let shortcuts = app.global_shortcut();
    if let Some(old) = current.take() {
        shortcuts.unregister(old).map_err(|err| err.to_string())?;
    }
    let Some(shortcut) = wanted else {
        return Ok(String::new());
    };
    shortcuts
        .on_shortcut(shortcut, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                let _ = show_window(app);
            }
        })
        .map_err(|err| format!("{} could not be registered: {err}", hotkey.trim()))?;
    *current = Some(shortcut);
    Ok(shortcut.into_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hotkeys_with_modifiers() {
        let shortcut = parse_hotkey(" CommandOrControl+Shift+Space ").unwrap();
        assert_eq!(parse_hotkey("CmdOrCtrl+shift+space").unwrap(), shortcut);
        assert!(parse_hotkey("Alt+KeyN").is_ok());
        assert!(parse_hotkey("Ctrl+Alt+N").is_ok());
    }

    #[test]
    fn names_a_text_that_is_no_hotkey() {
        let error = parse_hotkey("Shift+Nothing").unwrap_err();
        assert!(
            error.starts_with("\"Shift+Nothing\" is not a hotkey"),
            "{error}"
        );
        assert!(parse_hotkey("Shift+").is_err());
    }
}
