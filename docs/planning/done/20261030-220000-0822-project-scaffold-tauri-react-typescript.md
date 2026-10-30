---
id: 20261030-220000-0822
title: Project scaffold: Tauri, React, TypeScript
tags: [platform]
created: 2026-10-30
implements: [S-tauri, S-frontend]
depends_on: []
completed: 2026-10-30
---

## Description
Set up the application skeleton with the stack decided in D-20261030-210000-7b4e. Only the skeleton: features come in their own tasks. Signed release builds are a separate task.

Implements `S-tauri`, `S-frontend` in the [spec](../spec.md).

## Acceptance criteria
- [x] `npm run tauri dev` starts a Tauri 2 window on macOS rendering a React page
- [x] TypeScript runs with `strict: true`, built with Vite
- [x] Tailwind and shadcn/ui are set up; one shadcn component renders
- [x] Zustand is installed with one example store
- [x] tauri-specta generates TypeScript bindings for Rust commands; one example command is called only through the generated bindings
- [x] `npm run check` runs tsc, Biome and Vitest; `cargo test` runs; both pass
- [x] Folder layout separates Rust domain modules, TypeScript logic modules and React components, documented in a short `ARCHITECTURE.md`

## Implementation notes
- 2026-10-30: tauri-specta has no stable release for Tauri 2 (only `2.0.0-rc.x`). User approved pinning the rc versions exactly as an exception; to be recorded as a Decision.
- Bundle identifier: `dev.stardust.planner`. `tauri-plugin-opener` from the template is removed (not in the decided stack).
- Scaffolded with `create-tauri-app@4.7.5 -m npm -t react-ts --tauri-version 2 -y`, copied into the repo; template demo assets and README dropped.
- shadcn init: `shadcn@4.23.0 init -y -t vite -b radix -p nova --no-monorepo --no-rtl --no-pointer` (`-d` would pick the Next.js template). Its utils now come from shadcn's own `cn` package (0.5.1) instead of clsx + tailwind-merge. Geist font is bundled via fontsource, no network.
- Biome 2.6 also formats markdown; it reformatted `AGENTS.md` once, reverted. Markdown, `docs/`, `templates/`, `src-tauri/` and `src/bindings.ts` are excluded in `biome.json`.
- CSP set (was `null`): `default-src 'self' ipc: http://ipc.localhost`, inline styles, data: images and fonts.
- Done: all code; `npm run check` and `cargo test` pass; `npm run build` passes; `npm run tauri dev` launches the app process. The user confirmed the window visually (title "stardust", heading, "v0.1.0" from Rust, outlined Button); the agent shell has no screen capture permission. Spec nodes updated, D-20261030-211738-9tc3 appended. Nothing open.

## Result
The skeleton runs: `npm run tauri dev` opens a Tauri 2 window with a React page showing the app version read from Rust through the tauri-specta bindings, rendered with a shadcn Button and held in a Zustand store. `npm run check` (tsc strict, Biome, Vitest: 4 tests) and `cargo test` (2 tests, including the bindings export) pass; `npm run build` passes.

- Layout: Rust `src-tauri/src/domain/` and `commands.rs`; TypeScript `src/lib/`, `src/stores/`, `src/components/`. See `ARCHITECTURE.md`.
- tauri-specta, specta, specta-typescript pinned to exact release candidates (D-20261030-211738-9tc3). Template's `tauri-plugin-opener` removed. Strict CSP instead of `null`.
- Watch out: Biome 2.6 formats markdown; it stays excluded so planning files and `AGENTS.md` are never reformatted. Do not run shadcn with `-d` (it picks the Next.js template).
- `S-tauri` and `S-frontend` criteria extended to describe the current code. The signed builds criterion stays for the signed-builds task.

### Next session
- Nothing is committed yet: the scaffold, `ARCHITECTURE.md`, the spec changes and this task's move from `inbox/` to `done/` are all in the working tree.
- `next/` is empty. Run Triage inbox first. Now unblocked by this task: [ids](../inbox/20261030-220001-3fab-id-generation-and-filename-parsing.md), [planner.yml](../inbox/20261030-220002-5dbd-read-and-validate-planner-yml.md), [open terminal](../inbox/20261030-220016-3964-open-terminal-in-the-repository.md), [theme](../inbox/20261030-220018-573e-light-and-dark-theme.md), [signed builds](../inbox/20261030-220019-45ec-signed-release-builds.md). Ids and planner.yml unblock most of phase 1 (task file model, templates, planner block).
- Setup after a fresh clone: `npm install`; checks are `npm run check` and `cd src-tauri && cargo test`. Toolchain used: Node 22.20, Rust 1.99.
- New Rust commands: add to `commands.rs` with `#[specta::specta]`, register in `collect_commands!` in `lib.rs`, run `cargo test` to regenerate `src/bindings.ts`, call them only through `@/bindings`.
- New shadcn components: `npx shadcn@4.23.0 add <name> -y`.
- The agent shell cannot capture the screen; window checks need the user.
