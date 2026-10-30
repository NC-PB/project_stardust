import { load } from "@tauri-apps/plugin-store";

/** App settings, kept in the app data folder by tauri-plugin-store, never in a repository. */
const SETTINGS_FILE = "settings.json";

export async function readSetting<T>(key: string): Promise<T | undefined> {
  const store = await load(SETTINGS_FILE);
  return store.get<T>(key);
}

export async function writeSetting(key: string, value: unknown): Promise<void> {
  const store = await load(SETTINGS_FILE);
  await store.set(key, value);
  await store.save();
}
