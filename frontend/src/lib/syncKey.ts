// The owner's "sync key" (backend SYNC_KEY): typed once, kept in this
// browser so a reload or an expired session signs back in without the
// login dialog. Cleared on logout. Access is wrapped because storage
// can throw (private mode, blocked site data).

const STORAGE_KEY = 'chesspractice.syncKey';

export function getSyncKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSyncKey(key: string | null) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // not remembered; the key just has to be typed again next time
  }
}
