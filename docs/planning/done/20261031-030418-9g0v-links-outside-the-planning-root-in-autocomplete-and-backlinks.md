---
id: 20261031-030418-9g0v
title: Links outside the planning root in autocomplete and backlinks
tags: [files, editor]
created: 2026-10-31
implements: [S-links]
depends_on: []
completed: 2026-10-31
---

## Description
Found while building link autocomplete and backlinks ([task](20261031-021015-ikjg-link-autocomplete-and-backlinks.md)). Link autocomplete offers only the markdown files under the planning root, taken from the search index, so `README.md` or other docs cannot be picked. Backlinks are found in the whole repository, but are read again only when the open file changes or a watcher batch touches planning markdown: the watcher only watches the planning root (`S-watcher`), so a link added to or removed from `README.md` shows only after the next such batch or reopening the file.

Options: offer the repository's markdown files from the walk `links::markdown_files` (cost: one walk per refresh); re-read the backlinks when the app window gains focus; a refresh button in the backlinks list.

## Acceptance criteria
- [x] Autocomplete can offer markdown files outside the planning root, or the spec says why not
- [x] A link added outside the planning root to the open file shows in its backlinks without reopening the file
- [x] No background process and no new watcher on ignored folders such as `node_modules` or `target`

## Implementation notes
- Checked against the code: candidates came from the search index (`link_candidates`, planning root only), backlinks per request from `links::markdown_files` (whole repository), read again on open-file change and planning batches touching markdown (`useLinkStore`). Matched the description.
- Done: on the repository watcher of task [20261031-022800-5qen](20261031-022800-5qen-check-code-paths-again-when-code-files-change.md) (D-20261031-031612-c6rz). `link_lookup::outside_candidates` and the command `outside_link_candidates` (tested: `README.md` and `docs/guide.md` offered; the planning root, `node_modules`, hidden folders, `target` and non-markdown files not). `mergeCandidates` in `src/lib/links.ts` (tested). `useLinkStore` keeps `inside` and `outside`, `apply` reads `inside` and the backlinks, `applyOutside` reads `outside` and the backlinks when markdown changed (tested); `useProjectStore.receiveOutside` passes outside changes to it (tested).
- Decision D-20261031-032047-b8ny.

## Result
Link autocomplete now offers the markdown files outside the planning root too (`README.md`, other docs), merged with the planning files by path. A link added to or removed from a markdown file outside the planning root shows in the open file's backlinks within about a second, through the repository watcher's outside change, without reopening the file. No new watcher: the repository watcher of task 20261031-022800-5qen, which skips hidden folders, `node_modules`, `target` and runs only while the project is open.

Not tried in the running app: the popup with outside files and the backlinks list updating were not seen in the Tauri window; the chain watcher → event → store is covered by separate tests (Rust watcher, store wiring), not end to end. Limits: files outside the planning root without frontmatter are titled by their file name ("README"); each outside markdown change costs a walk of the repository's markdown files outside the planning root, plus the backlink walk while a file is open.
