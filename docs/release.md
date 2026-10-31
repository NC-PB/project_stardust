# Release builds

`.github/workflows/release.yml` builds signed bundles for Windows, macOS and Linux and attaches them to a draft GitHub release. Choices: D-20261031-021203-z7jn in the [spec](planning/spec.md).

## Making a release

1. Set the same version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, and commit.
2. Push a tag `v<version>`, for example `git tag v0.2.0 && git push origin v0.2.0`. The workflow stops when the tag does not match the version in `tauri.conf.json`.
3. The workflow creates a draft release for the tag, then builds:
   - Linux on `ubuntu-22.04`: `.deb`, `.rpm`, `.AppImage`, unsigned.
   - macOS on `macos-latest`: one universal `.app` and `.dmg` (Apple silicon and Intel), signed with a Developer ID certificate and notarized.
   - Windows on `windows-latest`: `.msi` and NSIS `-setup.exe`, signed with Azure Artifact Signing.
4. Check the draft on the Releases page, edit the notes, publish it.

A failed job can be re-run; it uploads to the same draft. Re-running the whole workflow creates a second draft; delete the extra one.

## Secrets and variables to add

Add these under Settings → Secrets and variables → Actions of the repository. Until they exist, the macOS and Windows jobs fail at signing.

### macOS (secrets)

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | The Developer ID Application certificate with its private key, exported as `.p12`, base64 encoded on one line. |
| `APPLE_CERTIFICATE_PASSWORD` | The password set when exporting the `.p12`. |
| `APPLE_SIGNING_IDENTITY` | The certificate's name, e.g. `Developer ID Application: Jane Doe (ABCDE12345)`. |
| `APPLE_ID` | Email of the Apple account used for notarization. |
| `APPLE_PASSWORD` | An app-specific password of that account, not the account password. |
| `APPLE_TEAM_ID` | The 10 character Team ID. |

How to get them:

1. Join the Apple Developer Program (paid). Only the Account Holder can create Developer ID certificates.
2. On a Mac, Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority, saved to disk. At developer.apple.com → Certificates, create a **Developer ID Application** certificate from that request, download it and open it, adding it to the login keychain.
3. `security find-identity -v -p codesigning` lists the identity; its quoted name is `APPLE_SIGNING_IDENTITY`.
4. In Keychain Access → My Certificates, expand the certificate, right-click the private key, Export as `.p12` with a password. Then `openssl base64 -A -in certificate.p12 -out certificate-base64.txt`; the file's content is `APPLE_CERTIFICATE`.
5. App-specific password: account.apple.com → Sign-In and Security → App-Specific Passwords.
6. Team ID: developer.apple.com/account → Membership details.

Tauri imports the certificate into a temporary keychain on the runner and notarizes through `notarytool` with the Apple ID. An App Store Connect API key (`APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`) would also work but needs the key file written to disk in the workflow; it is not set up.

### Windows (secrets and variables)

| Name | Kind | Value |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | secret | Application (client) ID of the Entra ID app registration that signs. |
| `AZURE_CLIENT_SECRET` | secret | A client secret of that app registration. |
| `AZURE_TENANT_ID` | secret | Directory (tenant) ID. |
| `AZURE_SIGNING_ENDPOINT` | variable | Endpoint of the Artifact Signing account's region, e.g. `https://weu.codesigning.azure.net`. |
| `AZURE_SIGNING_ACCOUNT` | variable | Name of the Artifact Signing account. |
| `AZURE_SIGNING_PROFILE` | variable | Name of the certificate profile. |

The last three are not secret and go under the Variables tab.

Why Azure Artifact Signing (formerly Trusted Signing): since June 2023, code signing certificates from public CAs must keep their private key in a hardware token or HSM, so a new certificate can no longer be exported as a `.pfx` and stored as a secret. Artifact Signing keeps the key in Microsoft's HSM, is billed monthly at a low fixed price, and is used from CI with an app registration. Tauri documents it with `artifact-signing-cli` as the sign command.

How to get them:

1. In the Azure portal, create an Artifact Signing account in a region; its endpoint is shown on the account's overview.
2. Complete identity validation in the account (an organization, or an individual where Microsoft offers that; check the current eligibility for your country).
3. Create a certificate profile of type Public Trust from the validated identity.
4. In Entra ID, create an app registration and a client secret. Note the client id, tenant id and secret value.
5. On the certificate profile (or the account), assign the app registration the role **Artifact Signing Certificate Profile Signer** (shown as "Trusted Signing Certificate Profile Signer" in older portals).

The workflow writes the sign command into `src-tauri/tauri.sign-windows.conf.json` on the runner and passes it with `--config`, so local builds stay unsigned. To use another signing service (for example Azure Key Vault with `relic`), change only that step and the Azure secrets.

### Linux

Nothing to add. Linux bundles are not signed.

### Not needed

`GITHUB_TOKEN` is provided by GitHub; the workflow gives it `contents: write` to create the draft and upload assets.
