import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { INITIAL_FEN } from 'chessops/fen';
import { getEngine, lowSkill, MIN_UCI_ELO, type Engine } from './engine';
import {
  fenAfter,
  gameStatus,
  legalUci,
  replay,
  sanOf,
  scoreText,
  turnOf,
  type Color,
  type Game,
  type GameResult,
} from './game';
import { analyseGame, terminalEval, type Analysis } from './analysis';
import { fetchGames, HttpError, removeGame, uploadGame } from './sync';
import { readJson, writeJson } from '../services/storage';

export const MIN_ELO = 800;
export const MAX_ELO = 3000;
export const ELO_STEP = 100;

export interface PlaySettings {
  elo: number;
  color: Color | 'random';
}

export interface Hint {
  ply: number;
  uci: string;
  san: string;
  score: string;
}

export interface Shown {
  game: Game | null;
  fens: string[];
  sans: string[];
}

const KEYS = {
  settings: 'play-settings-v1',
  game: 'play-game-v1',
  history: (owner: string | null) => (owner ? `play-history-u-${owner}` : 'play-history-v1'),
};
const HISTORY_SIZE = 200;

function load<T>(key: string, fallback: T): T {
  const raw = readJson<Partial<T> | null>(key, null);
  return raw ? { ...fallback, ...raw } : fallback;
}
function loadList<T>(key: string): T[] {
  const raw = readJson<T[]>(key, []);
  return Array.isArray(raw) ? raw : [];
}
function save(key: string, value: unknown) {
  writeJson(key, value);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const byEnded = (a: Game, b: Game) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt);

function opponentGo(elo: number): string {
  return elo < MIN_UCI_ELO ? `depth ${lowSkill(elo) + 1} movetime 250` : 'movetime 350';
}

function engineStrength(elo: number) {
  return elo >= MAX_ELO ? ('max' as const) : { elo };
}

interface PlayState extends Shown {
  settings: PlaySettings;
  viewPly: number | null;
  engine: 'loading' | 'ready' | 'thinking' | 'error';
  hint: Hint | null;
  hintLoading: boolean;
  flipped: boolean;

  review: Shown | null;
  history: Game[];
  owner: string | null;
  libraryStatus: 'idle' | 'loading' | 'ready';
  syncError: string | null;
  analysing: { id: string; done: number; total: number } | null;
  liveEvals: Record<number, { cp: number | null; mate: number | null }>;
  liveBest: Record<number, string>;

  toggleFlip: () => void;
  initEngine: () => void;
  loadLibrary: (username: string | null) => Promise<void>;
  updateSettings: (patch: Partial<PlaySettings>) => void;
  newGame: () => void;
  move: (uci: string) => void;
  takeback: () => void;
  resign: () => void;
  requestHint: () => void;
  setViewPly: (ply: number | null) => void;
  openGame: (id: string) => void;
  closeReview: () => void;
  deleteGame: (id: string) => void;
  analyse: () => void;
  cancelAnalysis: () => void;
  saveAnalysis: (id: string, analysis: Analysis) => void;
}

function initialGameState(): Shown {
  const game = readJson<Game | null>(KEYS.game, null);
  if (!game?.id) return { game: null, fens: [INITIAL_FEN], sans: [] };
  try {
    const { fens, sans } = replay(game.moves);
    return { game, fens, sans };
  } catch {
    return { game: null, fens: [INITIAL_FEN], sans: [] };
  }
}

export const usePlayStore = create<PlayState>((set, get) => {
  let engine: Engine | null = null;
  let libraryToken = 0;
  const token = () => {
    const g = get().game;
    return g ? `${g.id}:${g.moves.length}` : '';
  };

  const persist = () => save(KEYS.game, get().game);
  const shown = (): Shown => get().review ?? { game: get().game, fens: get().fens, sans: get().sans };

  function setHistory(history: Game[]) {
    const sorted = [...history].sort(byEnded).slice(0, HISTORY_SIZE);
    set({ history: sorted });
    save(KEYS.history(get().owner), sorted);
  }

  async function upload(game: Game) {
    if (!get().owner) return;
    try {
      await uploadGame(game);
      set({ syncError: null });
    } catch (err) {
      console.warn('game upload failed', err);
      set({
        syncError:
          err instanceof HttpError && err.status === 401
            ? 'Session expired: games are only saved on this device. Log in again.'
            : "Couldn't save the game to your account; it will be retried next time.",
      });
    }
  }

  function storeGame(game: Game) {
    setHistory([game, ...get().history.filter((h) => h.id !== game.id)]);
    if (get().game?.id === game.id) {
      set({ game });
      persist();
    }
    const review = get().review;
    if (review?.game?.id === game.id) set({ review: { ...review, game } });
    void upload(game);
  }

  function finish(result: GameResult) {
    const g = get().game;
    if (!g) return;
    set({ hint: null });
    storeGame({ ...g, result, endedAt: new Date().toISOString() });
  }

  function apply(uci: string): boolean {
    const { game, fens, sans } = get();
    if (!game || game.result) return false;
    const fen = fens[fens.length - 1];
    const legal = legalUci(fen, uci);
    if (!legal) return false;
    const san = sanOf(fen, legal);
    const newFens = [...fens, fenAfter(fen, legal)];
    set({
      game: { ...game, moves: [...game.moves, legal] },
      fens: newFens,
      sans: [...sans, san],
      hint: null,
      viewPly: get().review ? get().viewPly : null,
    });
    persist();
    const result = gameStatus(newFens);
    if (result) finish(result);
    return true;
  }

  function hasEval(ply: number): boolean {
    const e = get().liveEvals[ply];
    return !!e && (e.cp != null || e.mate != null);
  }

  async function evalPendingPlies() {
    const { game, fens, engine: status } = get();
    if (!game || !engine || status !== 'ready') return;
    const t = token();
    const startPly = Math.max(0, fens.length - 4);
    for (let ply = startPly; ply < fens.length; ply++) {
      if (token() !== t || get().engine !== 'ready') return;
      if (hasEval(ply)) continue;
      const fen = fens[ply];
      const term = terminalEval(fen);
      if (term) {
        set((s) => ({
          liveEvals: { ...s.liveEvals, [ply]: term },
          liveBest: { ...s.liveBest, [ply]: '' },
        }));
        continue;
      }
      try {
        const res = await engine.search(fen, 'max', 'movetime 150');
        if (token() !== t) return;
        if (res.line) {
          const sign = turnOf(fen) === 'white' ? 1 : -1;
          const evalWhite = {
            cp: res.line.cp != null ? res.line.cp * sign : null,
            mate: res.line.mate != null ? res.line.mate * sign : null,
          };
          set((s) => ({
            liveEvals: { ...s.liveEvals, [ply]: evalWhite },
            liveBest: { ...s.liveBest, [ply]: res.bestmove ?? '' },
          }));
        }
      } catch {
        // non-critical background search
      }
    }
  }

  async function engineTurn() {
    const { game, fens } = get();
    if (!game || game.result || !engine) return;
    const fen = fens[fens.length - 1];
    if (turnOf(fen) === game.playerColor) return;
    const t = token();
    set({ engine: 'thinking' });
    const started = Date.now();
    try {
      const strength = engineStrength(game.elo);
      const res = await engine.search(fen, strength, opponentGo(game.elo));
      if (strength === 'max' && res.line) {
        const sign = turnOf(fen) === 'white' ? 1 : -1;
        const evalWhite = {
          cp: res.line.cp != null ? res.line.cp * sign : null,
          mate: res.line.mate != null ? res.line.mate * sign : null,
        };
        const currentPly = fens.length - 1;
        set((s) => ({
          liveEvals: { ...s.liveEvals, [currentPly]: evalWhite },
          liveBest: { ...s.liveBest, [currentPly]: res.bestmove ?? '' },
        }));
      }
      await sleep(Math.max(0, 250 - (Date.now() - started)));
      if (token() !== t) return;
      if (res.bestmove) apply(res.bestmove);
    } catch (err) {
      console.warn('engine move failed', err);
      if (token() === t) set({ engine: 'error' });
      return;
    }
    if (get().engine === 'thinking') {
      set({ engine: 'ready' });
      void evalPendingPlies();
    }
  }

  return {
    settings: load<PlaySettings>(KEYS.settings, { elo: 1600, color: 'white' }),
    ...initialGameState(),
    viewPly: null,
    engine: 'loading',
    hint: null,
    hintLoading: false,
    flipped: false,
    review: null,
    history: loadList<Game>(KEYS.history(null)),
    owner: null,
    libraryStatus: 'idle',
    syncError: null,
    analysing: null,
    liveEvals: { 0: { cp: 20, mate: null } },
    liveBest: {},

    toggleFlip: () => set({ flipped: !get().flipped }),

    initEngine: () => {
      if (engine && !engine.failed) {
        if (get().engine === 'ready') void engineTurn();
        return;
      }
      set({ engine: 'loading' });
      engine = getEngine();
      engine.ready.then(
        () => {
          set({ engine: 'ready' });
          void engineTurn();
        },
        (err) => {
          console.warn('engine failed to start', err);
          set({ engine: 'error' });
        },
      );
    },

    loadLibrary: async (username) => {
      const s = get();
      if (s.owner === username && (s.libraryStatus === 'loading' || (s.libraryStatus === 'ready' && !s.syncError)))
        return;
      const t = ++libraryToken;
      set({ owner: username, libraryStatus: 'loading', syncError: null, review: null, viewPly: null });
      const local = loadList<Game>(KEYS.history(username));
      if (!username) {
        set({ history: [...local].sort(byEnded), libraryStatus: 'ready' });
        return;
      }
      const guest = loadList<Game>(KEYS.history(null));
      let server: Game[];
      try {
        server = await fetchGames();
      } catch (err) {
        if (t !== libraryToken) return;
        console.warn('game library failed to load', err);
        set({
          history: [...local].sort(byEnded),
          libraryStatus: 'ready',
          syncError: "Couldn't load your saved games from the server; showing local copy.",
        });
        return;
      }
      if (t !== libraryToken) return;
      const onServer = new Set(server.map((g) => g.id));
      const missing = [...local, ...guest].filter(
        (g, i, all) => g.result && !onServer.has(g.id) && all.findIndex((x) => x.id === g.id) === i,
      );
      setHistory([...server, ...missing]);
      set({ libraryStatus: 'ready' });
      for (const g of missing) {
        if (t !== libraryToken) return;
        await upload(g);
      }
    },

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      save(KEYS.settings, settings);
      set({ settings });
    },

    newGame: () => {
      const { settings, engine: status } = get();
      if (status === 'thinking') engine?.stop();
      const playerColor: Color =
        settings.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : settings.color;
      const game: Game = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        playerColor,
        elo: settings.elo,
        moves: [],
        result: null,
        hintsUsed: 0,
        takebacks: 0,
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      set({
        game,
        fens: [INITIAL_FEN],
        sans: [],
        review: null,
        viewPly: null,
        hint: null,
        hintLoading: false,
        flipped: false,
        liveEvals: { 0: { cp: 20, mate: null } },
        liveBest: {},
      });
      persist();
      if (engine && status !== 'loading' && status !== 'error') {
        set({ engine: 'ready' });
        engine.newGame();
        if (playerColor === 'white') void evalPendingPlies();
        else void engineTurn();
      }
    },

    move: (uci) => {
      const { game, fens, engine: status, viewPly, review } = get();
      if (!game || game.result || review || viewPly != null || status === 'thinking') return;
      if (turnOf(fens[fens.length - 1]) !== game.playerColor) return;
      if (apply(uci)) void engineTurn();
    },

    takeback: () => {
      const { game, engine: status } = get();
      if (!game || game.result || game.moves.length === 0) return;
      if (status === 'thinking') engine?.stop();
      const myParity = game.playerColor === 'white' ? 0 : 1;
      let moves = game.moves.slice(0, -1);
      while (moves.length > 0 && moves.length % 2 !== myParity) moves = moves.slice(0, -1);
      const { fens, sans } = replay(moves);
      const keepEvals: Record<number, { cp: number | null; mate: number | null }> = {};
      const keepBest: Record<number, string> = {};
      for (let i = 0; i < fens.length; i++) {
        if (get().liveEvals[i]) keepEvals[i] = get().liveEvals[i];
        if (get().liveBest[i] != null) keepBest[i] = get().liveBest[i];
      }
      set({
        game: { ...game, moves, takebacks: game.takebacks + 1 },
        fens,
        sans,
        viewPly: null,
        hint: null,
        hintLoading: false,
        liveEvals: keepEvals,
        liveBest: keepBest,
        engine: status === 'thinking' ? 'ready' : status,
      });
      persist();
      void engineTurn();
    },

    resign: () => {
      const { game } = get();
      if (!game || game.result) return;
      if (get().engine === 'thinking') engine?.stop();
      set({ engine: get().engine === 'thinking' ? 'ready' : get().engine });
      finish({ winner: game.playerColor === 'white' ? 'black' : 'white', reason: 'resign' });
    },

    requestHint: () => {
      const { game, fens, engine: status, hintLoading, viewPly, review } = get();
      if (!game || game.result || !engine || status !== 'ready' || hintLoading || viewPly != null || review) return;
      const fen = fens[fens.length - 1];
      if (turnOf(fen) !== game.playerColor) return;
      const t = token();
      const ply = game.moves.length;
      set({ hintLoading: true, game: { ...game, hintsUsed: game.hintsUsed + 1 } });
      persist();
      engine
        .search(fen, 'max', 'movetime 350')
        .then((res) => {
          if (token() !== t || !res.bestmove) return;
          const line = res.line;
          set({
            hint: {
              ply,
              uci: res.bestmove,
              san: sanOf(fen, res.bestmove),
              score: line ? scoreText(line.cp, line.mate, fen, game.playerColor) : '',
            },
          });
        })
        .catch((err) => console.warn('hint failed', err))
        .finally(() => {
          if (token() === t) set({ hintLoading: false });
        });
    },

    setViewPly: (ply) => {
      const { game, fens } = shown();
      const last = fens.length - 1;
      if (ply == null || ply > last || (ply === last && !game?.result)) set({ viewPly: null });
      else set({ viewPly: Math.max(0, ply) });
    },

    openGame: (id) => {
      const game = get().history.find((g) => g.id === id);
      if (!game) return;
      if (get().game?.id === id) {
        set({ review: null, viewPly: null });
        return;
      }
      const { fens, sans } = replay(game.moves);
      set({ review: { game, fens, sans }, viewPly: null, flipped: false });
    },

    closeReview: () => set({ review: null, viewPly: null }),

    deleteGame: (id) => {
      setHistory(get().history.filter((g) => g.id !== id));
      if (get().review?.game?.id === id) set({ review: null, viewPly: null });
      if (get().owner) {
        removeGame(id).catch((err) => {
          console.warn('game delete failed', err);
          set({ syncError: "Couldn't delete the game on the server." });
        });
      }
    },

    analyse: () => {
      const { game, fens } = shown();
      if (!game?.result || !engine || get().engine === 'error' || get().analysing) return;
      const id = game.id;
      set({ analysing: { id, done: 0, total: fens.length } });
      analyseGame(
        engine,
        fens,
        (done, total) => {
          if (get().analysing?.id === id) set({ analysing: { id, done, total } });
        },
        () => get().analysing?.id !== id,
      )
        .then((analysis) => {
          if (!analysis || get().analysing?.id !== id) return;
          set({ analysing: null });
          const latest = get().history.find((g) => g.id === id) ?? game;
          storeGame({ ...latest, analysis });
        })
        .catch((err) => {
          console.warn('analysis failed', err);
          if (get().analysing?.id === id) set({ analysing: null });
        });
    },

    cancelAnalysis: () => set({ analysing: null }),

    saveAnalysis: (id, analysis) => {
      const game = get().history.find((g) => g.id === id);
      if (game) storeGame({ ...game, analysis });
    },
  };
});

export function useShown(): Shown {
  return usePlayStore(useShallow((s) => s.review ?? { game: s.game, fens: s.fens, sans: s.sans }));
}

