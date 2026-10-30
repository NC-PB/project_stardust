---
id: 20261030-220019-45ec
title: Signed release builds
tags: [platform]
created: 2026-10-30
implements: [S-tauri]
depends_on: [20261030-220000-0822]
---

## Description
Build pipeline for distributable apps. The tool itself never runs git; this is CI configuration only.

Implements `S-tauri` in the [spec](../spec.md).

## Acceptance criteria
- [ ] CI builds the app for Windows, macOS and Linux
- [ ] macOS builds are signed and notarized, Windows builds are signed
- [ ] Build artifacts are attached to a release

## Implementation notes

## Result
