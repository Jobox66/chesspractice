// Saved games on the server (/games → Neon) for signed-in users. Guests
// keep their games in localStorage only (see store.ts).

import type { Game } from './game';

const API = import.meta.env.VITE_API_URL;

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch(`${API}/games`, { credentials: 'include' });
  if (!res.ok) throw new HttpError(res.status);
  const body = await res.json();
  const games: Game[] = [];
  for (const g of body.games ?? []) {
    const data = g.data as Game;
    if (data?.id && Array.isArray(data.moves)) games.push(data);
  }
  return games;
}

export async function uploadGame(game: Game): Promise<void> {
  const res = await fetch(`${API}/games/${encodeURIComponent(game.id)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(game),
  });
  if (!res.ok) throw new HttpError(res.status);
}

export async function removeGame(id: string): Promise<void> {
  const res = await fetch(`${API}/games/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new HttpError(res.status);
}
