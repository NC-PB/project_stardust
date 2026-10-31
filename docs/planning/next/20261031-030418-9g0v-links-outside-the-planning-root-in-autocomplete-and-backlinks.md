---
id: 20261031-030418-9g0v
title: Links outside the planning root in autocomplete and backlinks
tags: [files, editor]
created: 2026-10-31
implements: [S-links]
depends_on: []
---

## Description
Found while building link autocomplete and backlinks ([task](../done/20261031-021015-ikjg-link-autocomplete-and-backlinks.md)). Link autocomplete offers only the markdown files under the planning root, taken from the search index, so `README.md` or other docs cannot be picked. Backlinks are found in the whole repository, but are read again only when the open file changes or a watcher batch touches planning markdown: the watcher only watches the planning root (`S-watcher`), so a link added to or removed from `README.md` shows only after the next such batch or reopening the file.

Options: offer the repository's markdown files from the walk `links::markdown_files` (cost: one walk per refresh); re-read the backlinks when the app window gains focus; a refresh button in the backlinks list.

## Acceptance criteria
- [ ] Autocomplete can offer markdown files outside the planning root, or the spec says why not
- [ ] A link added outside the planning root to the open file shows in its backlinks without reopening the file
- [ ] No background process and no new watcher on ignored folders such as `node_modules` or `target`

## Implementation notes

## Result
