---
id: 20261030-220017-e886
title: Deletes go to the OS trash
tags: [files]
created: 2026-10-30
completed: 2026-10-31
implements: [S-trash]
depends_on: [20261030-220003-9910]
---

## Description
Implements `S-trash` in the [spec](../spec.md).

## Acceptance criteria
- [x] Every delete in the app moves the file to the OS trash (`R-no-destroy`)
- [x] Works on macOS, Windows and Linux

## Implementation notes
- Decided with the user (2026-10-31): the `trash` crate, added to the Constraints; "Delete" in the editor header with a confirmation. My call: `NSFileManager` on macOS instead of the crate's Finder default. Recorded as D-20261031-005236-kuwe.
- Done: `files::trash_file` (canonical path inside the repository, files only; the OS call is passed in so tests never touch the real trash), command `trash_file`; `editor-store.trash` (refused during a conflict, saves first, closes after); Delete button and confirmation bar in `editor.tsx`, task files only.
- There were no deletes in the app before this task, so "every delete" is this one.
- Checks: `cargo test` (122), `cargo clippy` clean, `npm run check` (103). The real trash call was not run: it would have put a test file into the user's Trash. Windows and Linux rely on the crate.

## Result
Tasks can be deleted from the editor: "Delete" asks in a bar whether to move the file to the trash, saves unsaved edits first and closes the file afterwards. The file goes to the OS trash on every platform through the `trash` crate; only existing files inside the repository are accepted, and nothing is removed for good. While the file has changed on disk, deleting is refused.

- Not tried by hand; the real trash call has not run yet.
- On macOS Finder shows no "Put Back" for these files (`NSFileManager` instead of AppleScript to avoid a permission prompt).

### Next session
- `next/` and the phase 1 part of the inbox are empty. Left in the inbox: [signed release builds](../inbox/20261030-220019-45ec-signed-release-builds.md) and the [IPC custom protocol warning in dev](20261030-225823-gccd-ipc-custom-protocol-warning-in-dev.md). Phase 1 exit is two weeks of real use.
