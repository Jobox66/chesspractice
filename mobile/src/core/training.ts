// Chapter building and trainable-move search, ported from the web app
// (frontend/src/util/{io,training,chapters}.ts).
import type { Position } from 'chessops';
import { parsePgn, transform, type PgnNodeData } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { makeFen, INITIAL_BOARD_FEN } from 'chessops/fen';
import { scalachessCharPair } from 'chessops/compat';
import { defaultPosition } from 'chessops/variant';
import * as Crypto from 'expo-crypto';
import type { Card } from 'ts-fsrs';
import { forEachNode } from './tree';
import { dueAt } from './srs';
import type {
  Chapter,
  Color,
  NodeSearch,
  TrainableContext,
  TrainableNode,
  TrainingData,
  TrainingMethod,
} from './types';

export const cardOf = (data: TrainingData, key: string | null): Card | null =>
  (key && data.training?.[key]) || null;

interface PgnCtx {
  pos: Position;
  ply: number;
  clone(): PgnCtx;
}
const pgnCtx = (pos: Position, ply: number): PgnCtx => ({
  pos,
  ply,
  clone() {
    return pgnCtx(this.pos.clone(), this.ply);
  },
});

// Parse the first game of a PGN into a chapter. Throws with a readable
// message on bad input.
export function chapterFromPgn(rawPgn: string, trainAs: Color, name: string): Chapter {
  const game = parsePgn(rawPgn)[0];
  if (!game) throw new Error('No game found in the PGN');
  let enabledCount = 0;
  const moves = transform<PgnNodeData, TrainingData, PgnCtx>(
    game.moves,
    pgnCtx(defaultPosition('chess'), 0),
    (ctx, data) => {
      const move = parseSan(ctx.pos, data.san);
      if (!move) throw new Error(`Illegal move: ${data.san}`);
      ctx.pos.play(move);
      ctx.ply++;
      const enabled = (ctx.ply % 2 === 1) === (trainAs === 'white');
      if (enabled) enabledCount++;
      return {
        id: scalachessCharPair(move),
        fen: makeFen(ctx.pos.toSetup()),
        san: data.san,
        comment: data.comments?.join('|') || '',
        ply: ctx.ply,
        training: {},
        enabled,
      };
    },
  );
  if (!moves.children.length) throw new Error('The PGN has no moves');
  return {
    name,
    trainAs,
    uuid: Crypto.randomUUID(),
    root: {
      data: { comment: '', fen: INITIAL_BOARD_FEN, id: '', ply: 0, san: '', enabled: false, training: {} },
      children: moves.children,
    },
    enabledCount,
    unseenCount: enabledCount,
    lastDueCount: 0,
  };
}

// Recompute enabled / unseen / due counts for the given user key.
export function withCounts(chapter: Chapter, key: string | null): Chapter {
  const now = Date.now();
  let enabledCount = 0;
  let unseenCount = 0;
  let lastDueCount = 0;
  forEachNode(chapter.root, (n) => {
    if (!n.data.enabled) return;
    enabledCount++;
    const card = cardOf(n.data, key);
    if (!card) unseenCount++;
    else if (dueAt(card) <= now) lastDueCount++;
  });
  return { ...chapter, enabledCount, unseenCount, lastDueCount };
}

// Server JSON -> Chapter[] (same ordering as the web app).
export function parseChapters(raw: any[] | null | undefined, key: string | null): Chapter[] {
  return (raw ?? [])
    .map((c: any) =>
      withCounts(
        { uuid: c.uuid, name: c.name, trainAs: c.trainAs, root: c.root, enabledCount: 0, unseenCount: 0, lastDueCount: 0 },
        key,
      ),
    )
    .sort(sortChapters);
}

export function sortChapters(a: Chapter, b: Chapter): number {
  if (a.trainAs !== b.trainAs) return a.trainAs === 'white' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

// Next move to learn (unseen) or recall (due), or null. Same search as
// computeNextTrainableNode in the web app, except DFS walks the main line
// (first child) first and depth is counted per ply.
export function nextTrainable(
  root: TrainableNode,
  method: TrainingMethod,
  key: string | null,
  search: NodeSearch,
): TrainableContext | null {
  type Entry = { node: TrainableNode; layer: number; pathToHere: string };
  const deque: Entry[] = root.children.map((child) => ({ node: child, layer: 0, pathToHere: '' }));
  const now = Date.now();
  while (deque.length) {
    const entry = search.algorithm === 'bfs' ? deque.shift()! : deque.pop()!;
    const { node } = entry;
    if (node.data.enabled) {
      const card = cardOf(node.data, key);
      if (method === 'recall' ? card && dueAt(card) <= now : !card) {
        return { startingPath: entry.pathToHere, targetMove: node };
      }
    }
    if (entry.layer < search.limit * 2 - 1) {
      // push in reverse so DFS (pop) visits the main line first
      for (let i = node.children.length - 1; i >= 0; i--) {
        deque.push({
          node: node.children[i],
          layer: entry.layer + 1,
          pathToHere: entry.pathToHere + node.data.id,
        });
      }
    }
  }
  return null;
}

// Time until the next card of this chapter falls due (ms), or null.
export function nextDueIn(chapter: Chapter, key: string | null): number | null {
  let best: number | null = null;
  const now = Date.now();
  forEachNode(chapter.root, (n) => {
    if (!n.data.enabled) return;
    const card = cardOf(n.data, key);
    if (!card) return;
    const d = dueAt(card) - now;
    if (best === null || d < best) best = d;
  });
  return best;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d`;
  if (s < 86400 * 365) return `${Math.round(s / (86400 * 30))} mo`;
  return `${(s / (86400 * 365)).toFixed(1)} y`;
}
