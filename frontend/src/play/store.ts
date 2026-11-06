import { create } from 'zustand';
import { INITIAL_FEN } from 'chessops/fen';
import { getEngine, lowSkill, MIN_UCI_ELO, type Engine } from './engine';
import { fenAfter, gameStatus, legalUci, replay, sanOf, scoreText, turnOf, type Color, type Game, type GameResult } from './game';

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

const KEYS = { settings: 'play-settings-v1', game: 'play-game-v1', history: 'play-history-v1' };
const HISTORY_SIZE = 30;

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

// Opponent search: UCI_Elo needs real thinking time to calibrate; the low
// levels are Skill Level plus a shallow depth.
function opponentGo(elo: number): string {
  return elo < MIN_UCI_ELO ? `depth ${lowSkill(elo) + 1} movetime 400` : 'movetime 800';
}

function engineStrength(elo: number) {
  return elo >= MAX_ELO ? ('max' as const) : { elo };
}

interface PlayState {
  settings: PlaySettings;
  game: Game | null;
  fens: string[];
  sans: string[];
  // A past position being looked at; null = following the game.
  viewPly: number | null;
  engine: 'loading' | 'ready' | 'thinking' | 'error';
  hint: Hint | null;
  hintLoading: boolean;
  history: Game[];
  flipped: boolean;

  toggleFlip: () => void;
  initEngine: () => void;
  updateSettings: (patch: Partial<PlaySettings>) => void;
  newGame: () => void;
  move: (uci: string) => void;
  takeback: () => void;
  resign: () => void;
  requestHint: () => void;
  setViewPly: (ply: number | null) => void;
}

function initialGameState() {
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
  const token = () => {
    const g = get().game;
    return g ? `${g.id}:${g.moves.length}` : '';
  };

  const persist = () => save(KEYS.game, get().game);

  function finish(result: GameResult) {
    const g = get().game;
    if (!g) return;
    const done: Game = { ...g, result, endedAt: new Date().toISOString() };
    const history = [done, ...get().history.filter((h) => h.id !== done.id)].slice(0, HISTORY_SIZE);
    set({ game: done, history, hint: null });
    save(KEYS.history, history);
    persist();
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
      viewPly: null,
    });
    persist();
    const result = gameStatus(newFens);
    if (result) finish(result);
    return true;
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
      // a beat before replying, so instant moves don't feel mechanical
      await sleep(Math.max(0, 350 - (Date.now() - started)));
      if (token() !== t) return; // new game / takeback meanwhile
      if (res.bestmove) apply(res.bestmove);
    } catch (err) {
      console.warn('engine move failed', err);
      if (token() === t) set({ engine: 'error' });
      return;
    }
    if (get().engine === 'thinking') set({ engine: 'ready' });
  }

  return {
    settings: load<PlaySettings>(KEYS.settings, { elo: 1600, color: 'white' }),
    ...initialGameState(),
    viewPly: null,
    engine: 'loading',
    hint: null,
    hintLoading: false,
    history: loadList<Game>(KEYS.history),
    flipped: false,

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
      set({ game, fens: [INITIAL_FEN], sans: [], viewPly: null, hint: null, hintLoading: false, flipped: false });
      persist();
      if (engine && status !== 'loading' && status !== 'error') {
        set({ engine: 'ready' });
        engine.newGame();
        void engineTurn();
      }
    },

    move: (uci) => {
      const { game, fens, engine: status, viewPly } = get();
      if (!game || game.result || viewPly != null || status === 'thinking') return;
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
      const { game, fens, engine: status, hintLoading, viewPly } = get();
      if (!game || game.result || !engine || status !== 'ready' || hintLoading || viewPly != null) return;
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

    setViewPly: (ply) => {
      const last = get().fens.length - 1;
      if (ply == null || ply >= last) set({ viewPly: null });
      else set({ viewPly: Math.max(0, ply) });
    },
  };
});
