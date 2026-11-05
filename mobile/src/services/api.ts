// HTTP calls to the Go backend. The app authenticates with the session
// id returned by POST /login (client: "mobile") sent as a bearer token.
import { create } from 'zustand';
import { API_URL } from './config';

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- Render free tier sleeps after 15 idle minutes; wait for it ----

export const useServerWake = create<{ waking: boolean }>(() => ({ waking: false }));

async function probe(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/healthz`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let inflight: Promise<boolean> | null = null;

// Resolves true once /healthz answers (up to ~150s), false otherwise.
export function ensureServerAwake(): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      if (await probe(3000)) return true;
      useServerWake.setState({ waking: true });
      const deadline = Date.now() + 150_000;
      try {
        while (Date.now() < deadline) {
          if (await probe(15_000)) return true;
          await new Promise((r) => setTimeout(r, 3000));
        }
        return false;
      } finally {
        useServerWake.setState({ waking: false });
      }
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  await ensureServerAwake();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Không kết nối được server. Kiểm tra mạng rồi thử lại.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text.trim() || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('application/json') ? res.json() : (undefined as T)) as Promise<T>;
}

export type LoginResult =
  | { kind: 'ok'; token: string; user: { username: string; picture?: string }; chapters: any[] }
  | { kind: 'needsUsername' }
  | { kind: 'usernameTaken' };

export async function exchangeIdToken(idToken: string, username?: string): Promise<LoginResult> {
  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ idToken, client: 'mobile', ...(username ? { username, picture: '' } : {}) }),
    });
    if (data?.needsUsername) return { kind: 'needsUsername' };
    if (!data?.sessionToken) {
      throw new ApiError(500, 'Server chưa hỗ trợ đăng nhập từ app (thiếu sessionToken). Hãy deploy backend mới.');
    }
    return { kind: 'ok', token: data.sessionToken, user: data.user, chapters: data.chapters };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { kind: 'usernameTaken' };
    if (e instanceof ApiError && e.status === 429) throw new ApiError(429, 'Thử quá nhiều lần. Đợi 1 phút.');
    if (e instanceof ApiError && e.status === 400 && /username/.test(e.message)) {
      throw new ApiError(400, 'Tên người dùng chỉ gồm 3–20 ký tự a-z, 0-9, _');
    }
    throw e;
  }
}
