import { create } from 'zustand';
import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
import { createCard, reviewCard, dueAt, type Card } from '../core/srs';
import type { Square } from '../core/chess';
import { loadPuzzleSet, type Puzzle, type PuzzleSet } from './data';
import { INITIAL_RATING, updateRating, type Rating } from './glicko';
import {
  fetchServerState,
  HttpError,
  loadLocalState,
  postAttempt,
  saveLocalState,
  type AttemptLog,
  type AttemptPost,
  type Progress,
} from './service';
import { readJson, writeJson } from '../services/storage';

export type RunPhase = 'intro' | 'play' | 'opponent' | 'wrong' | 'solution' | 'done';

export interface Run {
  id: number;
  puzzle: Puzzle;
  kind: 'rated' | 'review' | 'practice';
  fen: string;
  lastMove: [Square, Square] | null;
  step: number;
  phase: RunPhase;
  failed: boolean;
  solved: boolean;
  recorded: boolean;
  ratingDelta: number | null;
  hint: Square | null;
  wrongSan: string | null;
  startedAt: number;
}

export type Difficulty = -1 | 0 | 1;
export interface Settings {
  mode: 'rated' | 'review';
  difficulty: Difficulty;
  theme: string | null;
}

export const DIFFICULTY_OFFSET = 250;
const PICK_POOL = 20;
const SETTINGS_KEY = 'puzzle-settings-v1';

function loadSettings(): Settings {
  const fallback: Settings = { mode: 'rated', difficulty: 0, theme: null };
  const raw = readJson<Partial<Settings> | null>(SETTINGS_KEY, null);
  return raw ? { ...fallback, ...raw } : fallback;
}

function saveSettings(s: Settings) {
  writeJson(SETTINGS_KEY, s);
}

function position(fen: string) {
  return Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
}

function playUci(fen: string, uci: string) {
  const pos = position(fen);
  const move = normalizeMove(pos, parseUci(uci)!);
  const capture = 'from' in move && (pos.board.has(move.to) || (pos.board.get(move.from)?.role === 'pawn' && move.to === pos.epSquare));
  const san = makeSan(pos, move);
  pos.play(move);
  return {
    fen: makeFen(pos.toSetup()),
    lastMove: [uci.slice(0, 2), uci.slice(2, 4)] as [Square, Square],
    san,
    capture,
    mate: pos.isCheckmate(),
  };
}

export function isDue(p: Progress | undefined, now = new Date()): boolean {
  return !!p?.card && dueAt(p.card) <= now.getTime();
}

function matchesTheme(p: Puzzle, theme: string | null) {
  return !theme || p.themes.includes(theme);
}

export function duePuzzles(set: PuzzleSet, progress: Record<string, Progress>, theme: string | null): Puzzle[] {
  const now = new Date();
  return Object.entries(progress)
    .filter(([id, p]) => isDue(p, now) && set.byId.has(id))
    .map(([id]) => set.byId.get(id)!)
    .filter((p) => matchesTheme(p, theme))
    .sort((a, b) => dueAt(progress[a.id].card!) - dueAt(progress[b.id].card!));
}

function pickNew(set: PuzzleSet, progress: Record<string, Progress>, target: number, theme: string | null, skip?: string) {
  const pool = set.puzzles.filter((p) => !progress[p.id] && p.id !== skip && matchesTheme(p, theme));
  if (pool.length === 0) return null;
  pool.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  return pool[Math.floor(Math.random() * Math.min(PICK_POOL, pool.length))];
}

let queue: AttemptPost[] = [];
let flushing = false;

async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      await postAttempt(queue[0]);
      queue.shift();
    }
    usePuzzleStore.setState({ syncError: null });
  } catch (err) {
    console.warn('puzzle sync failed', err);
    usePuzzleStore.setState({
      syncError:
        err instanceof HttpError && err.status === 401
          ? 'Your session has expired, so results are not being saved. Please log in again.'
          : "Couldn't save to the server; will retry after the next puzzle.",
    });
  } finally {
    flushing = false;
  }
}

interface PuzzleState {
  setStatus: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  set: PuzzleSet | null;

  owner: string | null;
  progressStatus: 'idle' | 'loading' | 'ready';
  rating: Rating;
  progress: Record<string, Progress>;
  attempts: AttemptLog[];
  syncError: string | null;

  settings: Settings;
  run: Run | null;
  empty: string | null;

  loadSet: () => Promise<void>;
  loadProgress: (username: string | null) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  next: () => void;
  retry: () => void;
  openPuzzle: (id: string) => void;
  move: (uci: string) => void;
  hint: () => void;
  showSolution: () => void;
}

let runCounter = 0;
let loadCounter = 0;

export const usePuzzleStore = create<PuzzleState>((set, get) => {
  const patchRun = (id: number, patch: Partial<Run>) => {
    const run = get().run;
    if (run?.id === id) set({ run: { ...run, ...patch } });
  };
  const current = (id: number) => {
    const run = get().run;
    return run?.id === id ? run : null;
  };

  function start(puzzle: Puzzle, kind: Run['kind']) {
    const id = ++runCounter;
    set({
      empty: null,
      run: {
        id,
        puzzle,
        kind,
        fen: puzzle.fen,
        lastMove: null,
        step: 0,
        phase: 'intro',
        failed: false,
        solved: false,
        recorded: false,
        ratingDelta: null,
        hint: null,
        wrongSan: null,
        startedAt: Date.now(),
      },
    });
    setTimeout(() => playOpponent(id), 500);
  }

  function playOpponent(id: number) {
    const run = current(id);
    if (!run) return;
    const r = playUci(run.fen, run.puzzle.moves[run.step]);
    const step = run.step + 1;
    patchRun(id, {
      fen: r.fen,
      lastMove: r.lastMove,
      step,
      phase: step >= run.puzzle.moves.length ? 'done' : 'play',
      startedAt: run.step === 0 ? Date.now() : run.startedAt,
    });
  }

  function record(id: number, success: boolean) {
    const run = current(id);
    if (!run || run.recorded) return;
    if (run.kind === 'practice') {
      patchRun(id, { recorded: true });
      return;
    }
    const s = get();
    const prev = s.progress[run.puzzle.id];
    const rated = run.kind === 'rated' && !prev;
    const newRating = rated ? updateRating(s.rating, run.puzzle.rating, success) : null;

    let card: Card | null = null;
    if (!success) card = reviewCard(prev?.card ?? createCard(), false);
    else if (prev?.card) card = reviewCard(prev.card, true);

    const now = new Date();
    const durationMs = Math.max(0, now.getTime() - run.startedAt);
    const progress: Progress = {
      attempts: (prev?.attempts ?? 0) + 1,
      successes: (prev?.successes ?? 0) + (success ? 1 : 0),
      lastSuccess: success,
      card: card ?? prev?.card ?? null,
      updatedAt: now.toISOString(),
    };
    const log: AttemptLog = {
      itemId: run.puzzle.id,
      success,
      ratingAfter: newRating?.rating ?? null,
      durationMs,
      at: now.toISOString(),
    };
    const next = {
      rating: newRating ?? s.rating,
      progress: { ...s.progress, [run.puzzle.id]: progress },
      attempts: [...s.attempts, log],
    };
    set(next);
    patchRun(id, {
      recorded: true,
      ratingDelta: newRating ? Math.round(newRating.rating - s.rating.rating) : null,
    });

    if (s.owner) {
      queue.push({ itemId: run.puzzle.id, success, durationMs, card, rating: newRating });
      void flushQueue();
    } else {
      void saveLocalState(next).catch((err) => console.warn('puzzle local save failed', err));
    }
  }

  function playRest(id: number) {
    const run = current(id);
    if (!run || run.phase !== 'solution') return;
    if (run.step >= run.puzzle.moves.length) {
      patchRun(id, { phase: 'done' });
      return;
    }
    const r = playUci(run.fen, run.puzzle.moves[run.step]);
    patchRun(id, { fen: r.fen, lastMove: r.lastMove, step: run.step + 1 });
    setTimeout(() => playRest(id), 700);
  }

  return {
    setStatus: 'idle',
    set: null,
    owner: null,
    progressStatus: 'idle',
    rating: INITIAL_RATING,
    progress: {},
    attempts: [],
    syncError: null,
    settings: loadSettings(),
    run: null,
    empty: null,

    loadSet: async () => {
      if (get().setStatus === 'loading' || get().setStatus === 'ready') return;
      set({ setStatus: 'loading' });
      try {
        const result = await loadPuzzleSet();
        if (result === 'missing') set({ setStatus: 'missing' });
        else set({ setStatus: 'ready', set: result });
      } catch (err) {
        console.warn('puzzle set failed to load', err);
        set({ setStatus: 'error' });
      }
    },

    loadProgress: async (username) => {
      const token = ++loadCounter;
      queue = [];
      set({ progressStatus: 'loading', run: null, syncError: null });
      let state;
      let owner = username;
      try {
        state = username ? await fetchServerState() : await loadLocalState();
      } catch (err) {
        console.warn('puzzle progress failed to load', err);
        if (token !== loadCounter) return;
        owner = null;
        state = await loadLocalState();
        set({
          syncError:
            err instanceof HttpError && err.status === 401
              ? 'Your session has expired: using local progress.'
              : "Couldn't load progress from the server: using local progress.",
        });
      }
      if (token !== loadCounter) return;
      set({
        owner,
        progressStatus: 'ready',
        rating: state.rating ?? INITIAL_RATING,
        progress: state.progress,
        attempts: state.attempts,
      });
    },

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      saveSettings(settings);
      set({ settings });
      get().next();
    },

    next: () => {
      const { set: puzzleSet, progress, rating, settings, run } = get();
      if (!puzzleSet) return;
      if (settings.mode === 'review') {
        const due = duePuzzles(puzzleSet, progress, settings.theme);
        if (due.length === 0) {
          set({ run: null, empty: 'review' });
          return;
        }
        start(due[0], 'review');
        return;
      }
      const target = rating.rating + settings.difficulty * DIFFICULTY_OFFSET;
      const puzzle = pickNew(puzzleSet, progress, target, settings.theme, run?.puzzle.id);
      if (!puzzle) {
        set({ run: null, empty: 'exhausted' });
        return;
      }
      start(puzzle, 'rated');
    },

    retry: () => {
      const run = get().run;
      if (run) start(run.puzzle, 'practice');
    },

    openPuzzle: (id) => {
      const puzzle = get().set?.byId.get(id);
      if (puzzle) start(puzzle, 'practice');
    },

    move: (uci) => {
      const run = get().run;
      if (!run || run.phase !== 'play') return;
      const id = run.id;
      const pos = position(run.fen);
      const parsed = parseUci(uci);
      if (!parsed) return;
      const mine = normalizeMove(pos, parsed);
      if (!pos.isLegal(mine)) return;
      const expected = normalizeMove(pos, parseUci(run.puzzle.moves[run.step])!);
      const r = playUci(run.fen, uci);

      if (makeUci(mine) === makeUci(expected) || r.mate) {
        const step = run.step + 1;
        const finished = r.mate || step >= run.puzzle.moves.length;
        patchRun(id, {
          fen: r.fen,
          lastMove: r.lastMove,
          step,
          hint: null,
          wrongSan: null,
          phase: finished ? 'done' : 'opponent',
          solved: finished,
        });
        if (finished) record(id, !run.failed);
        else setTimeout(() => playOpponent(id), 350);
        return;
      }

      const before = { fen: run.fen, lastMove: run.lastMove };
      patchRun(id, { fen: r.fen, lastMove: r.lastMove, phase: 'wrong', wrongSan: r.san, failed: true, hint: null });
      record(id, false);
      setTimeout(() => {
        const now = current(id);
        if (now?.phase === 'wrong') patchRun(id, { ...before, phase: 'play' });
      }, 700);
    },

    hint: () => {
      const run = get().run;
      if (!run || run.phase !== 'play') return;
      patchRun(run.id, { hint: run.puzzle.moves[run.step].slice(0, 2), failed: true });
      record(run.id, false);
    },

    showSolution: () => {
      const run = get().run;
      if (!run || run.phase !== 'play') return;
      record(run.id, false);
      patchRun(run.id, { phase: 'solution', failed: true, hint: null });
      setTimeout(() => playRest(run.id), 400);
    },
  };
});

