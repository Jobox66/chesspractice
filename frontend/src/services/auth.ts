import { useAuthStore } from '../store/auth';
import { useTrainerStore } from '../store/state';
import { parseChapters } from '../util/chapters';
import { ensureServerAwake } from './serverWake';
import { getSyncKey, setSyncKey } from '../lib/syncKey';

const API_URL = import.meta.env.VITE_API_URL;

// Applies a successful /login response. The endpoint returns the same
// {user, chapters} shape as GET /repertoire, so we hydrate auth, replace
// the chapter list, and set repertoireAuthor (which triggers useWebsocket).
export function applyLoginResponse(data: any) {
  const auth = useAuthStore.getState();
  const trainer = useTrainerStore.getState();
  auth.setUser({
    username: data.user.username,
    picture: data.user.picture,
  });
  void trainer.setRepertoire(parseChapters(data.chapters));
  // triggers websocket hook
  if (data.user?.username) trainer.setRepertoireAuthor(data.user.username);
  auth.closeLogin();
}

// Signs in with the owner's sync key (POST /login-key). On success the
// key is remembered in this browser (see lib/syncKey); a key the server
// rejects is forgotten so startup doesn't keep retrying it.
export async function loginWithSyncKey(key: string): Promise<ExchangeResult> {
  await ensureServerAwake();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/login-key`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch (err) {
    console.error('sync key login request failed', err);
    return { kind: 'error', status: 0, message: 'Could not reach the server. Try again.' };
  }
  if (!res.ok) {
    const text = await res.text();
    let message = 'Login failed. Try again.';
    if (res.status === 401) message = 'Wrong sync key.';
    else if (res.status === 429) message = 'Too many attempts. Try again in a minute.';
    else if (res.status === 404)
      message = text.includes('sync account')
        ? 'The sync account (SYNC_USERNAME) does not exist on the server.'
        : 'Sync key login is not enabled on the server (set SYNC_KEY and SYNC_USERNAME).';
    if (res.status === 401 || res.status === 404) setSyncKey(null);
    return { kind: 'error', status: res.status, message };
  }
  setSyncKey(key);
  return { kind: 'ok', data: await res.json() };
}

// Startup helper: if this browser remembers a sync key, sign in with it.
// Returns whether that worked (the response is already applied).
export async function tryStoredSyncKey(): Promise<boolean> {
  const key = getSyncKey();
  if (!key) return false;
  const result = await loginWithSyncKey(key);
  if (result.kind !== 'ok') return false;
  applyLoginResponse(result.data);
  return true;
}

export type ExchangeResult =
  | { kind: 'ok'; data: any }
  // First sign-in for this account: the backend wrote nothing and wants
  // a username before it will create the user row.
  | { kind: 'needsUsername' }
  | { kind: 'usernameTaken' }
  | { kind: 'error'; status: number; message: string };

// Trades a Firebase ID token for a server session. Pass the signup
// details on the second round-trip of a first-time signup; picture is
// only honoured then (empty means "use the provider's photo, if any").
export async function exchangeIdToken(
  idToken: string,
  signup?: { username: string; picture: string },
): Promise<ExchangeResult> {
  // The free-tier backend may still be asleep; wait for it (with a
  // banner) so the login POST doesn't hit a proxy timeout.
  await ensureServerAwake();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signup ? { idToken, ...signup } : { idToken }),
    });
  } catch (err) {
    console.error('login request failed', err);
    return { kind: 'error', status: 0, message: 'Could not reach the server. Try again.' };
  }
  if (res.status === 409) return { kind: 'usernameTaken' };
  if (!res.ok) {
    const text = await res.text();
    console.error('login failed', res.status, text);
    let message = 'Login failed. Try again.';
    if (res.status === 429) message = 'Too many attempts. Try again in a minute.';
    else if (res.status === 400 && text.includes('picture')) message = 'That picture was rejected. Remove it and try again.';
    return { kind: 'error', status: res.status, message };
  }
  const data = await res.json();
  if (data.needsUsername) return { kind: 'needsUsername' };
  return { kind: 'ok', data };
}
