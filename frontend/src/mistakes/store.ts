import { create } from 'zustand';
import type { Key } from 'chessground/types';
import { createCard, reviewCard, type Card } from '../util/srs';
import { getEngine } from '../play/engine';
import { fenAfter, legalUci, replay, sanOf, turnOf } from '../play/game';
import { analyseGame, evalText, sameMove, terminalEval, winPct } from '../play/analysis';
import { usePlayStore } from '../play/store';
import {
  fetchServerState,
  HttpError,
  loadLocalState,
  postAttempt,
  saveLocalState,
  type AttemptLog,
  type AttemptPost,
  type Progress,
} from '../puzzles/service';
import { collectMistakes, unanalysedGames, type MistakeItem } from './items';

const KIND = 'mistake' as const;

// A move other than Stockfish's choice still counts when it keeps the
// position: it loses less than this much win% (i.e. it isn't even an
// inaccuracy by the analysis' own scale).
export const ACCEPT_DROP = 10;
// Thinking time for judging such a move: longer than the post-game pass, so
// a sound alternative isn't failed on a shallow look.
const CHECK_MOVETIME = 1000;

//   intro     the position before the opponent's move; it animates in
//   play      your move
//   checking  a move other than the engine's is being evaluated
//   done      answered (right, wrong, or answer shown)
export type Phase = 'intro' | 'play' | 'checking' | 'done';

export type Outcome =
  | { ok: true; reason: 'best' | 'mate' | 'good'; eval?: string }
  | { ok: false; reason: 'same' | 'worse' | 'unchecked' | 'shown'; eval?: string };

export interface Run {
  id: number;
  item: MistakeItem;
  // 'due' / 'new' are scheduled and recorded; 'practice' (a retry, or one
  // picked from the list) records nothing.
  kind: 'due' | 'new' | 'practice';
  fen: string;
  lastMove: [Key, Key] | null;
  phase: Phase;
  hinted: boolean;
  tried: string | null; // the move you played here (uci)
  triedSan: string | null;
  outcome: Outcome | null;
  startedAt: number;
}

export interface BatchAnalysis {
  games: number; // to analyse
  gamesDone: number;
  positions: number; // of the current game
  positionsDone: number;
}

export function isDue(p: Progress | undefined, now = Date.now()): boolean {
  return !!p?.card && p.card.due.getTime() <= now;
}

const toUciKeys = (uci: string): [Key, Key] => [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];

// ---------------------------------------------------------------------------
// Server writes are queued so they stay in order; a failed one is retried
// with the next.

let queue: AttemptPost[] = [];
let flushing = false;

async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    while (queue.length) {
      await postAttempt(queue[0], KIND);
      queue.shift();
    }
    useMistakeStore.setState({ syncError: null });
  } catch (err) {
    console.warn('mistake sync failed', err);
    useMistakeStore.setState({
      syncError:
        err instanceof HttpError && err.status === 401
          ? 'Your session has expired, so results are not being saved. Please log in again.'
          : "Couldn't save to the server; will retry after the next exercise.",
    });
  } finally {
    flushing = false;
  }
}

// Items are recomputed only when the game library changes.
let itemsFor: unknown = null;
let itemsCache: MistakeItem[] = [];
export function currentItems(): MistakeItem[] {
  const history = usePlayStore.getState().history;
  if (history !== itemsFor) {
    itemsFor = history;
    itemsCache = collectMistakes(history);
  }
  return itemsCache;
}

// ---------------------------------------------------------------------------

interface MistakeState {
  owner: string | null;
  progressStatus: 'idle' | 'loading' | 'ready';
  progress: Record<string, Progress>;
  attempts: AttemptLog[];
  syncError: string | null;

  run: Run | null;
  // Why nothing is on the board: no mistakes at all, or none due.
  empty: 'none' | 'caughtUp' | null;
  batch: BatchAnalysis | null;
  engineError: boolean;

  loadProgress: (username: string | null) => Promise<void>;
  next: () => void;
  retry: () => void;
  practice: (id: string) => void;
  move: (uci: string) => void;
  hint: () => void;
  showAnswer: () => void;
  analyseAll: () => void;
  cancelBatch: () => void;
}

let runCounter = 0;
let loadCounter = 0;
let batchCounter = 0;

export const useMistakeStore = create<MistakeState>((set, get) => {
  const current = (id: number) => {
    const run = get().run;
    return run?.id === id ? run : null;
  };
  const patchRun = (id: number, patch: Partial<Run>) => {
    const run = current(id);
    if (run) set({ run: { ...run, ...patch } });
  };

  function start(item: MistakeItem, kind: Run['kind']) {
    const id = ++runCounter;
    const intro = !!(item.prevFen && item.prevMove);
    set({
      empty: null,
      run: {
        id,
        item,
        kind,
        fen: intro ? item.prevFen! : item.fen,
        lastMove: null,
        phase: intro ? 'intro' : 'play',
        hinted: false,
        tried: null,
        triedSan: null,
        outcome: null,
        startedAt: Date.now(),
      },
    });
    if (intro) {
      setTimeout(() => {
        if (current(id)?.phase !== 'intro') return;
        patchRun(id, { fen: item.fen, lastMove: toUciKeys(item.prevMove!), phase: 'play', startedAt: Date.now() });
      }, 650);
    }
  }

  function record(id: number, success: boolean) {
    const run = current(id);
    if (!run || run.kind === 'practice') return;
    const s = get();
    const itemId = run.item.id;
    const prev = s.progress[itemId];
    const card: Card = reviewCard(prev?.card ?? createCard(), success);
    const now = new Date();
    const durationMs = Math.max(0, now.getTime() - run.startedAt);
    const progress: Progress = {
      attempts: (prev?.attempts ?? 0) + 1,
      successes: (prev?.successes ?? 0) + (success ? 1 : 0),
      lastSuccess: success,
      card,
      updatedAt: now.toISOString(),
    };
    const log: AttemptLog = { itemId, success, ratingAfter: null, durationMs, at: now.toISOString() };
    const next = { rating: null, progress: { ...s.progress, [itemId]: progress }, attempts: [...s.attempts, log] };
    set({ progress: next.progress, attempts: next.attempts });
    if (s.owner) {
      queue.push({ itemId, success, durationMs, card, rating: null });
      void flushQueue();
    } else {
      void saveLocalState(next, KIND).catch((err) => console.warn('mistake local save failed', err));
    }
  }

  function finish(id: number, outcome: Outcome) {
    const run = current(id);
    if (!run) return;
    // A hint makes a right answer a miss for the schedule.
    record(id, outcome.ok && !run.hinted);
    // A right move stays on the board; otherwise back to the position, where
    // the answer is drawn.
    if (outcome.ok) patchRun(id, { phase: 'done', outcome });
    else
      patchRun(id, {
        phase: 'done',
        outcome,
        fen: run.item.fen,
        lastMove: run.item.prevMove ? toUciKeys(run.item.prevMove) : null,
      });
  }

  // A move that is neither the engine's nor yours from the game: does it
  // hold the position?
  async function judge(id: number, uci: string) {
    const run = current(id);
    if (!run) return;
    const { item } = run;
    const after = fenAfter(item.fen, uci);
    let e = terminalEval(after);
    if (!e) {
      const engine = getEngine();
      try {
        await engine.ready;
        const res = await engine.search(after, 'max', `movetime ${CHECK_MOVETIME}`);
        const sign = turnOf(after) === 'white' ? 1 : -1;
        const line = res.line;
        e = {
          cp: line?.cp != null ? line.cp * sign : line?.mate != null ? null : 0,
          mate: line?.mate != null ? line.mate * sign : null,
        };
      } catch (err) {
        console.warn('engine check failed', err);
        set({ engineError: true });
        finish(id, { ok: false, reason: 'unchecked' });
        return;
      }
    }
    if (!current(id)) return;
    const mine = (w: number) => (item.color === 'white' ? w : 100 - w);
    const drop = mine(winPct(item.evalBefore)) - mine(winPct(e));
    const text = evalText(e, item.color);
    finish(id, drop < ACCEPT_DROP ? { ok: true, reason: 'good', eval: text } : { ok: false, reason: 'worse', eval: text });
  }

  return {
    owner: null,
    progressStatus: 'idle',
    progress: {},
    attempts: [],
    syncError: null,
    run: null,
    empty: null,
    batch: null,
    engineError: false,

    loadProgress: async (username) => {
      const token = ++loadCounter;
      queue = [];
      set({ progressStatus: 'loading', run: null, empty: null, syncError: null });
      let state;
      let owner = username;
      try {
        state = username ? await fetchServerState(KIND) : await loadLocalState(KIND);
      } catch (err) {
        console.warn('mistake progress failed to load', err);
        if (token !== loadCounter) return;
        owner = null;
        state = await loadLocalState(KIND);
        set({
          syncError:
            err instanceof HttpError && err.status === 401
              ? 'Your session has expired: using the progress saved in this browser.'
              : "Couldn't load progress from the server: using the progress saved in this browser.",
        });
      }
      if (token !== loadCounter) return;
      set({ owner, progressStatus: 'ready', progress: state.progress, attempts: state.attempts });
    },

    // Due reviews first (oldest due first), then mistakes never tried,
    // newest games first.
    next: () => {
      const items = currentItems();
      const { progress, run } = get();
      if (items.length === 0) {
        set({ run: null, empty: 'none' });
        return;
      }
      const now = Date.now();
      const due = items
        .filter((i) => isDue(progress[i.id], now))
        .sort((a, b) => progress[a.id].card!.due.getTime() - progress[b.id].card!.due.getTime());
      if (due.length) {
        start(due[0], 'due');
        return;
      }
      const fresh = items.find((i) => !progress[i.id] && i.id !== run?.item.id);
      if (fresh) {
        start(fresh, 'new');
        return;
      }
      set({ run: null, empty: 'caughtUp' });
    },

    retry: () => {
      const run = get().run;
      if (run) start(run.item, 'practice');
    },

    practice: (id) => {
      const item = currentItems().find((i) => i.id === id);
      if (item) start(item, 'practice');
    },

    move: (input) => {
      const run = get().run;
      if (!run || run.phase !== 'play') return;
      const { item } = run;
      const uci = legalUci(item.fen, input);
      if (!uci) return;
      const id = run.id;
      const triedSan = sanOf(item.fen, uci);
      patchRun(id, { fen: fenAfter(item.fen, uci), lastMove: toUciKeys(uci), tried: uci, triedSan });

      if (sameMove(uci, item.best)) return finish(id, { ok: true, reason: 'best' });
      if (triedSan.endsWith('#')) return finish(id, { ok: true, reason: 'mate' });
      if (sameMove(uci, item.played)) return finish(id, { ok: false, reason: 'same' });
      patchRun(id, { phase: 'checking' });
      void judge(id, uci);
    },

    hint: () => {
      const run = get().run;
      if (run?.phase === 'play') patchRun(run.id, { hinted: true });
    },

    showAnswer: () => {
      const run = get().run;
      if (run?.phase === 'play') finish(run.id, { ok: false, reason: 'shown' });
    },

    // Run the post-game analysis on every saved game that hasn't had it,
    // one after another; each result is saved (and synced) with its game.
    analyseAll: () => {
      if (get().batch) return;
      const games = unanalysedGames(usePlayStore.getState().history);
      if (games.length === 0) return;
      const token = ++batchCounter;
      const live = () => token === batchCounter && !!get().batch;
      set({ batch: { games: games.length, gamesDone: 0, positions: 0, positionsDone: 0 }, engineError: false });
      void (async () => {
        const engine = getEngine();
        try {
          await engine.ready;
          for (let i = 0; i < games.length; i++) {
            if (!live()) return;
            const g = games[i];
            const { fens } = replay(g.moves);
            set({ batch: { games: games.length, gamesDone: i, positions: fens.length, positionsDone: 0 } });
            const analysis = await analyseGame(
              engine,
              fens,
              (done, total) => {
                if (live()) set({ batch: { games: games.length, gamesDone: i, positions: total, positionsDone: done } });
              },
              () => !live(),
            );
            if (!analysis || !live()) return;
            usePlayStore.getState().saveAnalysis(g.id, analysis);
          }
        } catch (err) {
          console.warn('batch analysis failed', err);
          if (token === batchCounter) set({ engineError: true });
        } finally {
          if (token === batchCounter) set({ batch: null });
        }
        // New exercises may be ready: start one if the board is idle.
        if (token === batchCounter && !get().run) get().next();
      })();
    },

    cancelBatch: () => {
      batchCounter++;
      set({ batch: null });
    },
  };
});
