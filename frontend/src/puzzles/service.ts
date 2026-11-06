// Where puzzle progress lives: the backend (/drills/puzzle → Neon) when
// signed in, IndexedDB otherwise — the same split as the repertoire.

import { get, set } from 'idb-keyval';
import type { Card } from '../util/srs';
import type { Rating } from './glicko';

const API = import.meta.env.VITE_API_URL;
const KIND = 'puzzle';
const IDB_KEY = 'puzzle-progress-v1';
// Matches the server's history window.
const MAX_LOCAL_ATTEMPTS = 1000;

export interface Progress {
  attempts: number;
  successes: number;
  lastSuccess: boolean;
  // FSRS card; null until the puzzle is first failed.
  card: Card | null;
  updatedAt: string;
}

export interface AttemptLog {
  itemId: string;
  success: boolean;
  ratingAfter: number | null;
  durationMs: number;
  at: string;
}

export interface DrillState {
  rating: Rating | null;
  progress: Record<string, Progress>;
  attempts: AttemptLog[];
}

export interface AttemptPost {
  itemId: string;
  success: boolean;
  durationMs: number;
  card: Card | null;
  rating: Rating | null;
}

// JSON turns the card's Dates into strings; ts-fsrs needs them back.
function reviveCard(card: any): Card | null {
  if (!card) return null;
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

export async function fetchServerState(): Promise<DrillState> {
  const res = await fetch(`${API}/drills/${KIND}`, { credentials: 'include' });
  if (!res.ok) throw new HttpError(res.status);
  const raw = await res.json();
  const progress: Record<string, Progress> = {};
  for (const p of raw.progress ?? []) {
    progress[p.itemId] = {
      attempts: p.attempts,
      successes: p.successes,
      lastSuccess: p.lastSuccess,
      card: reviveCard(p.card),
      updatedAt: p.updatedAt,
    };
  }
  return { rating: raw.rating ?? null, progress, attempts: raw.attempts ?? [] };
}

export async function postAttempt(a: AttemptPost): Promise<void> {
  const res = await fetch(`${API}/drills/${KIND}/attempts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(a),
  });
  if (!res.ok) throw new HttpError(res.status);
}

export async function loadLocalState(): Promise<DrillState> {
  const raw = await get(IDB_KEY).catch(() => undefined);
  if (!raw) return { rating: null, progress: {}, attempts: [] };
  const progress: Record<string, Progress> = {};
  for (const [id, p] of Object.entries<any>(raw.progress ?? {})) progress[id] = { ...p, card: reviveCard(p.card) };
  return { rating: raw.rating ?? null, progress, attempts: raw.attempts ?? [] };
}

export async function saveLocalState(state: DrillState): Promise<void> {
  await set(IDB_KEY, {
    rating: state.rating,
    progress: state.progress,
    attempts: state.attempts.slice(-MAX_LOCAL_ATTEMPTS),
  });
}
