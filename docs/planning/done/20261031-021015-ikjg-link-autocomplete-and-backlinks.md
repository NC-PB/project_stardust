---
id: 20261031-021015-ikjg
title: Link autocomplete and backlinks
tags: [files, editor]
created: 2026-10-31
implements: [S-links]
depends_on: [20261031-021013-ihmk]
completed: 2026-10-31
---

## Description
Phase 3. 

Implements `S-links` in the [spec](../spec.md).

## Acceptance criteria
- [x] Typing a link in the editor offers files by title or id and inserts a relative link
- [x] A backlinks panel lists the files that link to the open file, each opening on click
- [x] Both update from watcher events

## Implementation notes
- Done: Rust `src-tauri/src/domain/link_lookup.rs` (`link_candidates` from the search index, `backlinks` per request over `links::markdown_files`); commands `link_candidates`, `backlinks`; `links.rs` only made `link_targets` and `escape` `pub(crate)`, `search.rs` got `SearchIndex::files`. Frontend `src/lib/links.ts` (query detection, matching, relative links, CodeMirror source), `src/stores/link-store.ts`, `src/components/backlinks.tsx`, wired into `editor.tsx` and `project-store.ts`. `@codemirror/autocomplete` is now a direct dependency (it was already installed through the basic setup).
- Open: links outside the planning root in autocomplete, and backlinks from there following changes (inbox task 20261031-030418-9g0v).

## Result
Typing `](` in source mode offers the planning files (every markdown file under the planning root, from the search index) by title, id or path, and choosing one inserts the link target relative to the open file; typing `[[` offers the same and replaces the `[[` (and a `]]` the editor closed after it) with a whole `[Title](relative/path.md)` link, so no wiki syntax is ever written (`R-plain-markdown`). Nothing is offered in the frontmatter, code fences or code spans, and the open file is left out. Under the editor a backlinks list names every markdown file of the repository linking to the open file (same walk and skip rules as the link rewriting, links in code and frontmatter not counted, anchors ignored); a click opens the file at its first link. The candidates and the backlinks are read again after each watcher batch touching markdown under the planning root, and the backlinks also whenever the open file changes, also when it follows a move (D-20261031-030417-45xv).

Tests: `link_lookup.rs` (backlinks from other columns, `README.md`, reference definitions, anchors and queries, escaped names; code spans, fences, frontmatter, web and root-absolute links, `node_modules` and hidden folders ignored; candidates from the index), `src/lib/links.test.ts`, `src/stores/link-store.test.ts`, `project-store.test.ts`. `npm run check`, `cargo test` and `cargo clippy --all-targets` pass.

Not tried in the running app: the completion popup, its interplay with CodeMirror's bracket closing (the `]]` and `)` the editor inserts are assumed as tested in `linkQueryAt`), and the backlinks list were not seen in the Tauri window. Limits: files outside the planning root are not offered, and backlinks from them follow their changes only after the next planning batch or reopening the file (inbox task 20261031-030418-9g0v); each such batch costs one walk of the repository while a file is open.
