// Build-time config. EXPO_PUBLIC_* values are inlined into the bundle by
// Expo CLI from mobile/.env (see .env.example). Both are public by
// design: the API URL is the Render host, and the Firebase web API key
// only identifies the project (the backend verifies every ID token).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://chesspractice-backend.onrender.com').replace(
  /\/+$/,
  '',
);
export const WS_URL = API_URL.replace(/^http/, 'ws');
export const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '';
