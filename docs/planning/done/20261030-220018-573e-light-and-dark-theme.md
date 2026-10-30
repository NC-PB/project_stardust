---
id: 20261030-220018-573e
title: Light and dark theme
tags: [workspace]
created: 2026-10-30
completed: 2026-10-31
implements: [S-theme]
depends_on: [20261030-220000-0822]
---

## Description
Implements `S-theme` in the [spec](../spec.md).

## Acceptance criteria
- [x] Light and dark theme, following the system by default
- [x] The choice can be overridden in app settings

## Implementation notes
- Plan: choice `system`, `light` or `dark` in the app settings (`settings.json` of `tauri-plugin-store`, key `theme`), `system` by default; a control in the app header. The resolved theme sets `.dark` on the document (shadcn tokens exist), the CodeMirror theme, the Mermaid theme and the native window theme (`core:window:allow-set-theme`, the only new permission).
- Done: `lib/theme.ts` (`resolveTheme`, `parseThemeChoice`), `stores/theme-store.ts` (system query shown at once, stored choice read after, a choice made before the read wins), `components/theme-switch.tsx` in the header of `App`. Editor: `sourceThemes` built from the app tokens with CodeMirror's `dark` flag; Mermaid renders again on a theme change. Capability `core:window:allow-set-theme` (checked by `tauri-build`).
- Decision D-20261031-003015-8wy7.
- Checks: `npm run check` (97 tests), `cargo build`. Not tried by hand in the running app.

## Result
The app has a light and a dark theme. By default it follows the system and switches at once when the system does; a System / Light / Dark switch in the header overrides it and is remembered in the app settings. The board, the editor, Mermaid diagrams and the window frame all follow.

- Not yet checked by hand in the running app; the editor's selection colour and the frame on macOS are the parts to look at.
- `S-tauri` still lists the capabilities without `core:window:allow-set-theme` (outside this task).

### Next session
- `next/` is empty. Phase 1 tasks left in the inbox: [open a terminal](../inbox/20261030-220016-3964-open-terminal-in-the-repository.md), [deletes to the OS trash](../inbox/20261030-220017-e886-deletes-go-to-the-os-trash.md).
