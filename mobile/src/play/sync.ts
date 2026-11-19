// Saved games on the server (/games → Neon) for signed-in users.
// Uses the mobile api() client (Bearer token + Render wake-up).

import { api, ApiError } from '../services/api';
import type { Game } from '../../../shared/game';

export { ApiError as HttpError };

export async function fetchGames(): Promise<Game[]> {
  const body = await api<{ games?: { data?: Game }[] }>('/games');
  const games: Game[] = [];
  for (const g of body?.games ?? []) {
    const data = g.data;
    if (data?.id && Array.isArray(data.moves)) games.push(data);
  }
  return games;
}

export async function uploadGame(game: Game): Promise<void> {
  await api(`/games/${encodeURIComponent(game.id)}`, {
    method: 'POST',
    body: JSON.stringify(game),
  });
}

export async function removeGame(id: string): Promise<void> {
  await api(`/games/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

