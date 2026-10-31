---
id: 20261030-225823-gccd
title: IPC custom protocol warning in dev
tags: [platform]
created: 2026-10-30
implements: [S-tauri]
depends_on: []
completed: 2026-10-31
---

## Description
Found while checking the [file watcher](../done/20261030-220007-e420-file-watcher-with-move-detection.md) in `npm run tauri dev` on macOS. Every IPC call at startup logs:

`[console.warn] IPC custom protocol failed, Tauri will now use the postMessage interface instead TypeError: Load failed`

Calls still work through the fallback. Not checked whether the warning existed before this task. The CSP in `tauri.conf.json` allows `ipc: http://ipc.localhost` through `default-src`; the cause may be the CSP, the dev server origin, or a Tauri default.

## Acceptance criteria
- [x] The cause is known and written down here
- [x] `npm run tauri dev` starts without the warning, or the reason it is harmless is recorded in the spec

## Implementation notes
- Cause: in tauri 2.12.5, `scripts/ipc-protocol.js` warns and falls back to postMessage whenever an `ipc://` fetch is rejected. WebKit rejects in-flight fetches with `TypeError: Load failed` when the page reloads or navigates. The flag lives in the page, so the reloaded page uses the custom protocol again.
- Not the CSP: in desktop dev the webview loads `devUrl` directly and no CSP applies (`protocol/tauri.rs` adds the header only to `tauri://` assets). Not CORS: the IPC handler answers with `Access-Control-Allow-Origin: *`.
- Verified with temporary logging in a scratch copy: three clean starts, 44 startup calls, all over `ipc://`, no warning. A `location.reload()` 75 ms after load reproduced the reported lines, one per in-flight call. Rewriting `src/bindings.ts` with the same content gave only an HMR update, not a reload.
- The reload in the original run was not reproduced; likely a Vite full reload ("new dependencies optimized") after new npm packages.

## Result
The warning is harmless and nothing was changed: it appears only when the dev page reloads while IPC calls are in flight, and the fallback lasts for that one page. Recorded in `S-tauri` and D-20261031-010818-k2vn.

- A warning on a clean start, or in a release build, would point to a real IPC or CSP problem.
- A production build was not checked.
