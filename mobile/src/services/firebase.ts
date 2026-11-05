// Email + password sign-in through the Firebase Auth REST API. We only
// need a fresh ID token to trade for a backend session (POST /login), so
// the Firebase SDK and its native setup aren't needed.
// https://firebase.google.com/docs/reference/rest/auth
import { FIREBASE_API_KEY } from './config';

const BASE = 'https://identitytoolkit.googleapis.com/v1/accounts';

const MESSAGES: Record<string, string> = {
  EMAIL_NOT_FOUND: 'Sai email hoặc mật khẩu.',
  INVALID_PASSWORD: 'Sai email hoặc mật khẩu.',
  INVALID_LOGIN_CREDENTIALS: 'Sai email hoặc mật khẩu.',
  INVALID_EMAIL: 'Email không hợp lệ.',
  EMAIL_EXISTS: 'Email này đã có tài khoản. Hãy đăng nhập.',
  USER_DISABLED: 'Tài khoản đã bị khoá.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Thử quá nhiều lần. Đợi một lúc rồi thử lại.',
  MISSING_PASSWORD: 'Chưa nhập mật khẩu.',
  OPERATION_NOT_ALLOWED: 'Đăng nhập bằng email/mật khẩu chưa được bật trong Firebase.',
};

async function call(endpoint: string, body: object): Promise<any> {
  if (!FIREBASE_API_KEY) throw new Error('App chưa được cấu hình EXPO_PUBLIC_FIREBASE_API_KEY.');
  let res: Response;
  try {
    res = await fetch(`${BASE}:${endpoint}?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Không kết nối được Firebase. Kiểm tra mạng.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code: string = data?.error?.message ?? '';
    // codes look like "WEAK_PASSWORD : Password should be at least 6 characters"
    const key = code.split(' ')[0];
    if (key === 'WEAK_PASSWORD') throw new Error('Mật khẩu cần ít nhất 6 ký tự.');
    throw new Error(MESSAGES[key] ?? `Lỗi Firebase: ${code || res.status}`);
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
