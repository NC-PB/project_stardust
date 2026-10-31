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
Checked before starting: `S-tauri` matches the code (no CI existed). Its first criterion says "signed builds for Windows, macOS, Linux", while this task asks for signed Windows and macOS builds only; Linux bundles stay unsigned. The node criterion is to be worded accordingly when the task is finished.

Done (2026-10-31):
- `.github/workflows/release.yml`: on a pushed tag `v*`, a first job checks the tag against the version in `src-tauri/tauri.conf.json` and creates one draft release; a matrix then builds on `ubuntu-22.04`, `macos-latest` (`--target universal-apple-darwin`) and `windows-latest`, runs `npm ci`, and calls `tauri-apps/tauri-action` (pinned to `action-v1.0.0` by SHA) with the draft's `releaseId`. The frontend build runs through `beforeBuildCommand`. Linux job installs the Tauri 2 packages (`libwebkit2gtk-4.1-dev` and others). All actions are pinned by SHA.
- macOS: signing and notarization by Tauri from `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- Windows: Azure Artifact Signing through `artifact-signing-cli` 0.12.0; the `signCommand` is written to `src-tauri/tauri.sign-windows.conf.json` on the runner from repository variables and passed with `--config`, so `tauri.conf.json` is unchanged and local builds stay unsigned.
- `docs/release.md`: how to release, and every secret and variable the owner must add with how to obtain it.
- Validated: the YAML parses (Python `yaml`), `actionlint` 1.7.7 reports no errors (its shellcheck rule was skipped, shellcheck is not installed).
- Decision D-20261031-021203-z7jn in the spec.

Open:
- The owner adds the secrets and variables listed in `docs/release.md` (Apple Developer ID certificate, Apple ID notarization, Azure Artifact Signing account and app registration).
- The workflow has never run. Nothing below is verified: that Tauri's own keychain import works with these secrets, that notarization passes, that `artifact-signing-cli` signs the `.exe`, `.msi` and NSIS installer on the runner, that the three jobs attach their bundles to the draft.
- All acceptance criteria stay unticked until a run shows them.

Next step: once the secrets exist, push a tag matching the app version (e.g. `v0.1.0`), check the run and the draft release (signature with `codesign -dv --verbose=4` and `spctl -a -vv` on the `.app`, `Get-AuthenticodeSignature` on the Windows installers), then tick the criteria, update `S-tauri` and finish the task.

## Result
