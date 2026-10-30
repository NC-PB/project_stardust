/** Label for the app version shown in the UI; `null` while it is not loaded yet. */
export function versionLabel(version: string | null): string {
  return version === null ? "loading…" : `v${version}`;
}
