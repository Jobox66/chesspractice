import { create } from 'zustand';
import type { Key } from 'chessground/types';
import { Chess, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
import { createCard, reviewCard, type Card } from '../util/srs';
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

// ---------------------------------------------------------------------------
// One puzzle being played.
//
//   intro     the starting position, before the opponent's move animates in
//   play      the solver's turn
//   opponent  the solver's move was right; the reply is about to be played
//   wrong     a wrong move is on the board for a moment, then taken back
//   solution  the remaining moves are being shown
//   done      finished (solved, or failed and the solution shown)
export type RunPhase = 'intro' | 'play' | 'opponent' | 'wrong' | 'solution' | 'done';

export interface Run {
  id: number;
  puzzle: Puzzle;
  // 'rated': a new puzzle, counts for rating. 'review': a due card, updates
  // the schedule only. 'practice': a replay of the same puzzle, records nothing.
  kind: 'rated' | 'review' | 'practice';
  fen: string;
  lastMove: [Key, Key] | null;
  step: number;
  phase: RunPhase;
  // A mistake, a hint or the solution makes the attempt a failure, even if
  // the solver then plays it out.
  failed: boolean;
  solved: boolean;
  recorded: boolean;
  ratingDelta: number | null;
  hint: Key | null;
  wrongSan: string | null;
  startedAt: number;
}

export type Difficulty = -1 | 0 | 1;
export interface Settings {
  mode: 'rated' | 'review';
  difficulty: Difficulty;
  theme: string | null;
}

// Points above/below your rating for Dễ / Khó.
export const DIFFICULTY_OFFSET = 250;
// Pick at random among this many puzzles closest to the target, so the
// order isn't the same for everyone and retries of "next" vary.
const PICK_POOL = 20;

const SETTINGS_KEY = 'puzzle-settings-v1';

function loadSettings(): Settings {
  const fallback: Settings = { mode: 'rated', difficulty: 0, theme: null };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    return raw ? { ...fallback, ...raw } : fallback;
  } catch {
    return fallback;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings just don't stick */
  }
}

// ---------------------------------------------------------------------------
// Chess helpers

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
    lastMove: [uci.slice(0, 2), uci.slice(2, 4)] as [Key, Key],
    san,
    capture,
    mate: pos.isCheckmate(),
  };
}

let sounds: { move: HTMLAudioElement; capture: HTMLAudioElement } | null = null;
function playSound(capture: boolean) {
  try {
    sounds ??= {
      move: new Audio('/sound/public_sound_standard_Move.mp3'),
      capture: new Audio('/sound/public_sound_standard_Capture.mp3'),
    };
    const a = capture ? sounds.capture : sounds.move;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* no audio: fine */
  }
}

// ---------------------------------------------------------------------------
// Selection

export function isDue(p: Progress | undefined, now = new Date()): boolean {
  return !!p?.card && p.card.due.getTime() <= now.getTime();
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
    .sort((a, b) => progress[a.id].card!.due.getTime() - progress[b.id].card!.due.getTime());
}

function pickNew(set: PuzzleSet, progress: Record<string, Progress>, target: number, theme: string | null, skip?: string) {
  const pool = set.puzzles.filter((p) => !progress[p.id] && p.id !== skip && matchesTheme(p, theme));
  if (pool.length === 0) return null;
  pool.sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target));
  return pool[Math.floor(Math.random() * Math.min(PICK_POOL, pool.length))];
}

// ---------------------------------------------------------------------------
// Server writes go through a queue so a slow or failed request never
// reorders attempts; a failed one stays queued and is retried with the next.

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
          ? 'Phiên đăng nhập đã hết hạn, kết quả chưa được lưu. Hãy đăng nhập lại.'
          : 'Chưa lưu được kết quả lên server, sẽ thử lại ở bài sau.',
    });
  } finally {
    flushing = false;
  }
}

// ---------------------------------------------------------------------------

interface PuzzleState {
  setStatus: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  set: PuzzleSet | null;

  // Whose progress is loaded: a username, or null for this browser only.
  owner: string | null;
  progressStatus: 'idle' | 'loading' | 'ready';
  rating: Rating;
  progress: Record<string, Progress>;
  attempts: AttemptLog[];
  syncError: string | null;

  settings: Settings;
  run: Run | null;
  // Why there is no puzzle to show (all done, nothing due, …).
  empty: string | null;

  loadSet: () => Promise<void>;
  loadProgress: (username: string | null) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  next: () => void;
  retry: () => void;
  // Replay any puzzle from the history; never recorded.
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
    setTimeout(() => playOpponent(id), 600);
  }

  function playOpponent(id: number) {
    const run = current(id);
    if (!run) return;
    const r = playUci(run.fen, run.puzzle.moves[run.step]);
    playSound(r.capture);
    const step = run.step + 1;
    patchRun(id, {
      fen: r.fen,
      lastMove: r.lastMove,
      step,
      phase: step >= run.puzzle.moves.length ? 'done' : 'play',
      // the clock starts when the solver can move
      startedAt: run.step === 0 ? Date.now() : run.startedAt,
    });
  }

  // Store the result of this run once: at the first failure, or on solving.
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

    // Only puzzles you got wrong come back: a miss (re)schedules the card,
    // and a later success on a card pushes it further out.
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
    playSound(r.capture);
    patchRun(id, { fen: r.fen, lastMove: r.lastMove, step: run.step + 1 });
    setTimeout(() => playRest(id), 750);
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
              ? 'Phiên đăng nhập đã hết hạn: đang dùng tiến độ lưu trên trình duyệt này.'
              : 'Không tải được tiến độ từ server: đang dùng tiến độ lưu trên trình duyệt này.',
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
      playSound(r.capture);

      // Any mate is accepted, as on Lichess: some puzzles have two.
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
      patchRun(run.id, { hint: run.puzzle.moves[run.step].slice(0, 2) as Key, failed: true });
      record(run.id, false);
    },

    showSolution: () => {
      const run = get().run;
      // Not during 'wrong': the wrong move is still on the board until it's
      // taken back, and the solution must start from the real position.
      if (!run || run.phase !== 'play') return;
      record(run.id, false);
      patchRun(run.id, { phase: 'solution', failed: true, hint: null });
      setTimeout(() => playRest(run.id), 400);
    },
  };
});
