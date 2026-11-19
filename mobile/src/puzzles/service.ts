import type { Card } from '../core/srs';
import type { Rating } from '../../../shared/glicko';
import { api, ApiError } from '../services/api';
import { readJson, writeJson } from '../services/storage';

export type DrillKind = 'puzzle' | 'mistake';
const LOCAL_KEYS: Record<DrillKind, string> = {
  puzzle: 'puzzle-progress-v1',
  mistake: 'mistake-progress-v1',
};
const MAX_LOCAL_ATTEMPTS = 1000;

export interface Progress {
  attempts: number;
  successes: number;
  lastSuccess: boolean;
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

function reviveCard(card: any): Card | null {
  if (!card) return null;
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

export { ApiError as HttpError };

export async function fetchServerState(kind: DrillKind = 'puzzle'): Promise<DrillState> {
  const raw = await api<any>(`/drills/${kind}`);
  const progress: Record<string, Progress> = {};
  for (const p of raw?.progress ?? []) {
    progress[p.itemId] = {
      attempts: p.attempts,
      successes: p.successes,
      lastSuccess: p.lastSuccess,
      card: reviveCard(p.card),
      updatedAt: p.updatedAt,
    };
  }
  return { rating: raw?.rating ?? null, progress, attempts: raw?.attempts ?? [] };
}

export async function postAttempt(a: AttemptPost, kind: DrillKind = 'puzzle'): Promise<void> {
  await api(`/drills/${kind}/attempts`, {
    method: 'POST',
    body: JSON.stringify(a),
  });
}

export async function loadLocalState(kind: DrillKind = 'puzzle'): Promise<DrillState> {
  const raw = readJson<any>(LOCAL_KEYS[kind], null);
  if (!raw) return { rating: null, progress: {}, attempts: [] };
  const progress: Record<string, Progress> = {};
  for (const [id, p] of Object.entries<any>(raw.progress ?? {})) {
    progress[id] = { ...p, card: reviveCard(p.card) };
  }
  return { rating: raw.rating ?? null, progress, attempts: raw.attempts ?? [] };
}

export async function saveLocalState(state: DrillState, kind: DrillKind = 'puzzle'): Promise<void> {
  writeJson(LOCAL_KEYS[kind], {
    rating: state.rating,
    progress: state.progress,
    attempts: state.attempts.slice(-MAX_LOCAL_ATTEMPTS),
  });
}

