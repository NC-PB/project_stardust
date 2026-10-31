---
id: 20261031-114210-r3nd
title: Frontmatter form only on task files
tags: [editor]
created: 2026-10-31
implements: [S-editor-core]
---

## Description
Opening `spec.md` shows the task frontmatter form (Title, Tags, Created, Completed, Priority, Implements, Depends on, Parent) with the issue "the filename does not start with a task id". The spec, the braindump and other planning files are not tasks, so the form takes the top of the pane with fields and an error that do not apply. Found while trying the new window layout ([20261031-111041-wl8c](../done/20261031-111041-wl8c-window-layout-and-visual-identity.md)).

`S-editor-core` says "Frontmatter editable as a form on top of the file" without saying for which files.

## Acceptance criteria
- [ ] Decide with the user whether non-task files get no form, or a form with only the fields their frontmatter has (`id`, `title`, `status`, `reviewed` for spec files)
- [ ] A spec or braindump file shows no task filename issue
- [ ] `S-editor-core` criteria say which files get the form

## Implementation notes

## Result
