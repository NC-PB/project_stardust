---
id: 20261030-225823-gccd
title: IPC custom protocol warning in dev
tags: [platform]
created: 2026-10-30
implements: [S-tauri]
depends_on: []
---

## Description
Found while checking the [file watcher](../done/20261030-220007-e420-file-watcher-with-move-detection.md) in `npm run tauri dev` on macOS. Every IPC call at startup logs:

`[console.warn] IPC custom protocol failed, Tauri will now use the postMessage interface instead TypeError: Load failed`

Calls still work through the fallback. Not checked whether the warning existed before this task. The CSP in `tauri.conf.json` allows `ipc: http://ipc.localhost` through `default-src`; the cause may be the CSP, the dev server origin, or a Tauri default.

## Acceptance criteria
- [ ] The cause is known and written down here
- [ ] `npm run tauri dev` starts without the warning, or the reason it is harmless is recorded in the spec

## Implementation notes

## Result
