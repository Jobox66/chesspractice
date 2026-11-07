import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { INITIAL_FEN } from 'chessops/fen';
import { getEngine, lowSkill, MIN_UCI_ELO, type Engine } from './engine';
import { fenAfter, gameStatus, legalUci, replay, sanOf, scoreText, turnOf, type Color, type Game, type GameResult } from './game';
import { analyseGame, type Analysis } from './analysis';
import { fetchGames, HttpError, removeGame, uploadGame } from './sync';

export const MIN_ELO = 800;
export const MAX_ELO = 3000; // the slider's top stop means "full strength"
export const ELO_STEP = 100;

export interface PlaySettings {
  elo: number;
  color: Color | 'random';
}

export interface Hint {
  ply: number; // position the hint is for (= moves.length)
  uci: string;
  san: string;
  score: string;
}

// A game on screen: the one being played, or a saved one opened for review.
export interface Shown {
  game: Game | null;
  fens: string[];
  sans: string[];
}

// Finished games: localStorage for guests; for a signed-in user the server
// is the source and localStorage keeps a per-user copy, so a game that
// failed to upload (sleeping server, offline) is re-sent on the next load.
const KEYS = {
  settings: 'play-settings-v1',
  game: 'play-game-v1',
  history: (owner: string | null) => (owner ? `play-history-u-${owner}` : 'play-history-v1'),
};
const HISTORY_SIZE = 200;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function loadList<T>(key: string): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function save(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the game just won't survive a reload */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const byEnded = (a: Game, b: Game) => (b.endedAt ?? b.startedAt).localeCompare(a.endedAt ?? a.startedAt);

// Opponent search: UCI_Elo needs real thinking time to calibrate; the low
// levels are Skill Level plus a shallow depth.
function opponentGo(elo: number): string {
  return elo < MIN_UCI_ELO ? `depth ${lowSkill(elo) + 1} movetime 400` : 'movetime 800';
}

function engineStrength(elo: number) {
  return elo >= MAX_ELO ? ('max' as const) : { elo };
}

interface PlayState extends Shown {
  settings: PlaySettings;
  // A past position being looked at (of the shown game); null = the end.
  viewPly: number | null;
  engine: 'loading' | 'ready' | 'thinking' | 'error';
  hint: Hint | null;
  hintLoading: boolean;
  flipped: boolean;

  review: Shown | null;
  history: Game[];
  owner: string | null; // signed-in username whose library is loaded
  libraryStatus: 'idle' | 'loading' | 'ready';
  syncError: string | null;
  analysing: { id: string; done: number; total: number } | null;
  liveEvals: Record<number, { cp: number | null; mate: number | null }>;

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
  // Attach an analysis run elsewhere (the mistakes trainer) to a saved game.
  saveAnalysis: (id: string, analysis: Analysis) => void;
}

function initialGameState(): Shown {
  const game = load<Game | null>(KEYS.game, null);
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
            ? 'Session expired: games are only saved in this browser. Log in again.'
            : "Couldn't save the game to your account; it will be retried next time.",
      });
    }
  }

  // Put an updated finished game everywhere it appears, save and upload it.
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

  async function evalCurrentPosition() {
    const { game, fens, engine: status } = get();
    if (!game || game.result || !engine || status !== 'ready') return;
    const ply = fens.length - 1;
    const fen = fens[ply];
    if (get().liveEvals[ply]?.cp != null || get().liveEvals[ply]?.mate != null) return;
    const t = token();
    try {
      const res = await engine.search(fen, 'max', 'movetime 250');
      if (token() !== t || !res.line) return;
      const sign = turnOf(fen) === 'white' ? 1 : -1;
      const evalWhite = {
        cp: res.line.cp != null ? res.line.cp * sign : null,
        mate: res.line.mate != null ? res.line.mate * sign : null,
      };
      set((s) => ({ liveEvals: { ...s.liveEvals, [ply]: evalWhite } }));
    } catch {
      // non-critical background search
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
      const res = await engine.search(fen, engineStrength(game.elo), opponentGo(game.elo));
      if (res.line) {
        const sign = turnOf(fen) === 'white' ? 1 : -1;
        const evalWhite = {
          cp: res.line.cp != null ? res.line.cp * sign : null,
          mate: res.line.mate != null ? res.line.mate * sign : null,
        };
        const currentPly = fens.length - 1;
        set((s) => ({ liveEvals: { ...s.liveEvals, [currentPly]: evalWhite } }));
      }
      // a beat before replying, so instant moves don't feel mechanical
      await sleep(Math.max(0, 350 - (Date.now() - started)));
      if (token() !== t) return; // new game / takeback meanwhile
      if (res.bestmove) apply(res.bestmove);
    } catch (err) {
      console.warn('engine move failed', err);
      if (token() === t) set({ engine: 'error' });
      return;
    }
    if (get().engine === 'thinking') {
      set({ engine: 'ready' });
      void evalCurrentPosition();
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
          void engineTurn(); // resume a saved game where it's Stockfish's move
        },
        (err) => {
          console.warn('engine failed to start', err);
          set({ engine: 'error' });
        },
      );
    },

    loadLibrary: async (username) => {
      // Already loaded (or loading) for this user, e.g. by the mistakes
      // page: keep it, along with any game open for review. A load that
      // fell back to the local copy is retried.
      const s = get();
      if (s.owner === username && (s.libraryStatus === 'loading' || (s.libraryStatus === 'ready' && !s.syncError))) return;
      const t = ++libraryToken;
      set({ owner: username, libraryStatus: 'loading', syncError: null, review: null, viewPly: null });
      const local = loadList<Game>(KEYS.history(username));
      if (!username) {
        set({ history: [...local].sort(byEnded), libraryStatus: 'ready' });
        return;
      }
      // Signed in: the server list, plus anything only this browser has —
      // games that failed to upload, and games played as a guest before
      // logging in. Those are uploaded now.
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
          syncError: "Couldn't load your saved games from the server; showing this browser's copy.",
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
      });
      persist();
      if (engine && status !== 'loading' && status !== 'error') {
        set({ engine: 'ready' });
        engine.newGame();
        if (playerColor === 'white') void evalCurrentPosition();
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
      // Back to the last position where it was your move.
      const myParity = game.playerColor === 'white' ? 0 : 1;
      let moves = game.moves.slice(0, -1);
      while (moves.length > 0 && moves.length % 2 !== myParity) moves = moves.slice(0, -1);
      const { fens, sans } = replay(moves);
      set({
        game: { ...game, moves, takebacks: game.takebacks + 1 },
        fens,
        sans,
        viewPly: null,
        hint: null,
        hintLoading: false,
        engine: status === 'thinking' ? 'ready' : status,
      });
      persist();
      // Playing Black and took back Stockfish's first move: it moves again.
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
        .search(fen, 'max', 'movetime 1200')
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

    // null = the end of the game ("live"). A finished game can also select
    // its last move explicitly, to read that move's review.
    setViewPly: (ply) => {
      const { game, fens } = shown();
      const last = fens.length - 1;
      if (ply == null || ply > last || (ply === last && !game?.result)) set({ viewPly: null });
      else set({ viewPly: Math.max(0, ply) });
    },

    openGame: (id) => {
      const game = get().history.find((g) => g.id === id);
      if (!game) return;
      // The game being played (if it's this one) is shown as itself.
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

// The game on screen and its positions; re-renders only when they change.
export function useShown(): Shown {
  return usePlayStore(useShallow((s) => s.review ?? { game: s.game, fens: s.fens, sans: s.sans }));
}
