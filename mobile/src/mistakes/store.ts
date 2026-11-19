import { create } from 'zustand';
import { createCard, reviewCard, dueAt, type Card } from '../core/srs';
import type { Square } from '../core/chess';
import { getEngine, REVIEW_MOVETIME } from '../play/engine';
import { fenAfter, legalUci, replay, sanOf, turnOf } from '../../../shared/game';
import { analyseGame, evalText, sameMove, terminalEval, winPct } from '../../../shared/analysis';
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
export const ACCEPT_DROP = 10;
const CHECK_MOVETIME = 250;

export type Phase = 'intro' | 'play' | 'checking' | 'done';

export type Outcome =
  | { ok: true; reason: 'best' | 'mate' | 'good'; eval?: string }
  | { ok: false; reason: 'same' | 'worse' | 'unchecked' | 'shown'; eval?: string };

export interface Run {
  id: number;
  item: MistakeItem;
  kind: 'due' | 'new' | 'practice';
  fen: string;
  lastMove: [Square, Square] | null;
  phase: Phase;
  hinted: boolean;
  tried: string | null;
  triedSan: string | null;
  outcome: Outcome | null;
  startedAt: number;
}

export interface BatchAnalysis {
  games: number;
  gamesDone: number;
  positions: number;
  positionsDone: number;
}

export function isDue(p: Progress | undefined, now = Date.now()): boolean {
  return !!p?.card && dueAt(p.card) <= now;
}

const toUciKeys = (uci: string): [Square, Square] => [uci.slice(0, 2), uci.slice(2, 4)];

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

interface MistakeState {
  owner: string | null;
  progressStatus: 'idle' | 'loading' | 'ready';
  progress: Record<string, Progress>;
  attempts: AttemptLog[];
  syncError: string | null;

  run: Run | null;
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
      }, 600);
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
    record(id, outcome.ok && !run.hinted);
    if (outcome.ok) patchRun(id, { phase: 'done', outcome });
    else
      patchRun(id, {
        phase: 'done',
        outcome,
        fen: run.item.fen,
        lastMove: run.item.prevMove ? toUciKeys(run.item.prevMove) : null,
      });
  }

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
              ? 'Your session has expired: using local progress.'
              : "Couldn't load progress from the server: using local progress.",
        });
      }
      if (token !== loadCounter) return;
      set({ owner, progressStatus: 'ready', progress: state.progress, attempts: state.attempts });
    },

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
        .sort((a, b) => dueAt(progress[a.id].card!) - dueAt(progress[b.id].card!));
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
              REVIEW_MOVETIME,
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
        if (token === batchCounter && !get().run) get().next();
      })();
    },

    cancelBatch: () => {
      batchCounter++;
      set({ batch: null });
    },
  };
});

