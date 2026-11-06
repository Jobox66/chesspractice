// On-device persistence.
// - Session (token + user) in SecureStore (Android Keystore-backed).
// - Offline ("playground") chapters as one JSON file per chapter in the
//   app's document directory: no size cap, unlike AsyncStorage's ~2 MB
//   row limit on Android, and a write touches only one chapter.
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { Chapter } from '../core/types';

const SESSION_KEY = 'chesspractice.session';

export type StoredSession = { token: string; username: string; picture?: string };

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export async function saveSession(s: StoredSession | null): Promise<void> {
  if (s) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

function chaptersDir(): Directory {
  const dir = new Directory(Paths.document, 'chapters');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

const chapterFile = (uuid: string) => new File(chaptersDir(), `${uuid}.json`);

// Only the tree and identity are stored; counts are recomputed on load.
export function writeLocalChapter(c: Chapter): void {
  const file = chapterFile(c.uuid);
  if (!file.exists) file.create({ overwrite: true });
  file.writeSync(JSON.stringify({ uuid: c.uuid, name: c.name, trainAs: c.trainAs, root: c.root }));
}

export function deleteLocalChapter(uuid: string): void {
  const file = chapterFile(uuid);
  if (file.exists) file.delete();
}

export function readLocalChapters(): any[] {
  const out: any[] = [];
  for (const item of chaptersDir().list()) {
    if (!(item instanceof File) || !item.name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(item.textSync()));
    } catch {
      // skip a corrupt file rather than losing the whole repertoire
    }
  }
  return out;
}

export function hasLocalChapters(): boolean {
  return chaptersDir()
    .list()
    .some((i) => i instanceof File && i.name.endsWith('.json'));
}

// The owner's sync key, kept so an expired session signs back in silently.
const SYNC_KEY = 'chesspractice.syncKey';

export async function loadSyncKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SYNC_KEY);
  } catch {
    return null;
  }
}

export async function saveSyncKey(key: string | null): Promise<void> {
  if (key) await SecureStore.setItemAsync(SYNC_KEY, key);
  else await SecureStore.deleteItemAsync(SYNC_KEY);
}
