---
id: 20261030-220000-0822
title: Project scaffold: Tauri, React, TypeScript
tags: [platform]
created: 2026-10-30
implements: [S-tauri, S-frontend]
depends_on: []
---

## Description
Set up the application skeleton with the stack decided in D-20261030-210000-7b4e. Only the skeleton: features come in their own tasks. Signed release builds are a separate task.

Implements `S-tauri`, `S-frontend` in the [spec](../spec.md).

## Acceptance criteria
- [ ] `npm run tauri dev` starts a Tauri 2 window on macOS rendering a React page
- [ ] TypeScript runs with `strict: true`, built with Vite
- [ ] Tailwind and shadcn/ui are set up; one shadcn component renders
- [ ] Zustand is installed with one example store
- [ ] tauri-specta generates TypeScript bindings for Rust commands; one example command is called only through the generated bindings
- [ ] `npm run check` runs tsc, Biome and Vitest; `cargo test` runs; both pass
- [ ] Folder layout separates Rust domain modules, TypeScript logic modules and React components, documented in a short `ARCHITECTURE.md`

## Implementation notes

## Result
