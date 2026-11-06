// Email + password sign-in through the Firebase Auth REST API. We only
// need a fresh ID token to trade for a backend session (POST /login), so
// the Firebase SDK and its native setup aren't needed.
// https://firebase.google.com/docs/reference/rest/auth
import { FIREBASE_API_KEY } from './config';

const BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

const MESSAGES: Record<string, string> = {
  EMAIL_NOT_FOUND: 'Wrong email or password.',
  INVALID_PASSWORD: 'Wrong email or password.',
  INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
  INVALID_EMAIL: 'Invalid email.',
  EMAIL_EXISTS: 'This email already has an account. Log in instead.',
  USER_DISABLED: 'This account is disabled.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a while and try again.',
  MISSING_PASSWORD: 'Enter a password.',
  OPERATION_NOT_ALLOWED: 'Email/password sign-in is not enabled in Firebase.',
};

async function call(endpoint: string, body: object): Promise<any> {
  if (!FIREBASE_API_KEY) throw new Error('The app is missing EXPO_PUBLIC_FIREBASE_API_KEY.');
  let res: Response;
  try {
    res = await fetch(`${BASE}:${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach Firebase. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code: string = data?.error?.message ?? '';
    // codes look like "WEAK_PASSWORD : Password should be at least 6 characters"
    const key = code.split(' ')[0];
    if (key === 'WEAK_PASSWORD') throw new Error('Passwords need at least 6 characters.');
    throw new Error(MESSAGES[key] ?? `Firebase error: ${code || res.status}`);
  }
  return data;
}

export async function signInWithPassword(email: string, password: string): Promise<string> {
  const data = await call('signInWithPassword', { email, password, returnSecureToken: true });
  return data.idToken;
}

export async function signUpWithPassword(email: string, password: string): Promise<string> {
  const data = await call('signUp', { email, password, returnSecureToken: true });
  return data.idToken;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await call('sendOobCode', { requestType: 'PASSWORD_RESET', email });
}
