// Data model shared with the web app (frontend/src/types/training.ts) and
// the backend (backend/internal/domain). Keep the wire shape identical:
// the server stores and returns exactly this tree.
import type { Card } from 'ts-fsrs';

export type Color = 'white' | 'black';
export type TrainingMethod = 'learn' | 'recall';
export type TrainingOutcome = 'success' | 'alternate' | 'failure';

// Training cards are keyed by username (signed in) or PLAYGROUND_KEY
// (local-only mode), so collaborators keep independent schedules.
export interface TrainingData {
  id: string; // scalachess char pair of the move; path = concatenated ids
  fen: string;
  ply: number;
  san: string;
  comment: string;
  enabled: boolean; // true for moves of the side being trained
  training: Record<string, Card>;
}

// Plain structural node: trees arrive as JSON (server, files), so they are
// not chessops ChildNode class instances, though those fit this shape.
export interface TrainableNode {
  data: TrainingData;
  children: TrainableNode[];
}

export interface Chapter {
  name: string;
  uuid: string;
  trainAs: Color;
  root: TrainableNode;
  // Derived, recomputed on load (see computeCounts).
  enabledCount: number;
  unseenCount: number;
  lastDueCount: number;
}

export interface TrainableContext {
  // path of the position the move is played from
  startingPath: string;
  targetMove: TrainableNode;
}

export interface NodeSearch {
  algorithm: 'bfs' | 'dfs';
  limit: number;
}

export const DEFAULT_NODE_SEARCH: NodeSearch = { algorithm: 'dfs', limit: 30 };

export const PLAYGROUND_KEY = '__playground__';
