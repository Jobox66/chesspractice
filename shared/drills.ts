// Drill progress (puzzles, mistakes) as stored locally and by the backend's
// /drills/<kind> API. Each app keeps its own storage and HTTP code.
import type { Card } from './srs';
import type { Rating } from './glicko';

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
