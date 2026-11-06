// Stockfish 19 lite (single-threaded WASM, GPL-3) in a Web Worker. The
// files live in public/stockfish/ and need no special server headers.
//
// One engine serves both the opponent (strength-limited) and hints (full
// strength): searches are queued, and each one sets its own strength first.

export const ENGINE_URL = '/stockfish/stockfish-19-lite-single.js';

// UCI_Elo bottoms out at 1320; below that we fall back to Skill Level plus a
// shallow depth, which is only roughly calibrated.
export const MIN_UCI_ELO = 1320;
export const MAX_UCI_ELO = 3190;

export type Strength = { elo: number } | 'max';

export interface SearchLine {
  // From the side to move's point of view.
  cp: number | null;
  mate: number | null;
  pv: string[];
}

export interface SearchResult {
  bestmove: string | null;
  line: SearchLine | null;
}

type Listener = (line: string) => void;

function strengthCommands(strength: Strength): string[] {
  if (strength === 'max' || strength.elo >= MAX_UCI_ELO) {
    return ['setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20'];
  }
  if (strength.elo >= MIN_UCI_ELO) {
    return [
      'setoption name Skill Level value 20',
      'setoption name UCI_LimitStrength value true',
      `setoption name UCI_Elo value ${Math.round(strength.elo)}`,
    ];
  }
  return ['setoption name UCI_LimitStrength value false', `setoption name Skill Level value ${lowSkill(strength.elo)}`];
}

// 800 → 0 … 1300 → 5
export function lowSkill(elo: number): number {
  return Math.max(0, Math.min(5, Math.round((elo - 800) / 100)));
}

function parseInfo(line: string): SearchLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.split(' pv ')[1].trim().split(/\s+/);
  return {
    cp: score[1] === 'cp' ? Number(score[2]) : null,
    mate: score[1] === 'mate' ? Number(score[2]) : null,
    pv,
  };
}

export class Engine {
  private worker: Worker;
  private listeners = new Set<Listener>();
  private chain: Promise<unknown> = Promise.resolve();
  readonly ready: Promise<void>;
  failed = false;

  constructor(url = ENGINE_URL) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e) => {
      const text = String(e.data);
      for (const l of [...this.listeners]) l(text);
    };
    this.ready = new Promise<void>((resolve, reject) => {
      this.worker.onerror = (e) => {
        this.failed = true;
        reject(new Error(e.message || 'engine failed to load'));
      };
      this.waitFor((l) => l === 'uciok', 30000)
        .then(() => {
          this.send('isready');
          return this.waitFor((l) => l === 'readyok', 30000);
        })
        .then(() => resolve(), reject);
      this.send('uci');
    });
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(match: (line: string) => boolean, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error('engine timeout'));
      }, timeoutMs);
      const listener = (line: string) => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(line);
      };
      this.listeners.add(listener);
    });
  }

  // Queue a search; `go` is the UCI go arguments, e.g. "movetime 800".
  search(fen: string, strength: Strength, go: string): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      await this.ready;
      for (const c of strengthCommands(strength)) this.send(c);
      this.send('isready');
      await this.waitFor((l) => l === 'readyok', 10000);

      let last: SearchLine | null = null;
      const collect: Listener = (l) => {
        const info = parseInfo(l);
        if (info) last = info;
      };
      this.listeners.add(collect);
      try {
        this.send(`position fen ${fen}`);
        this.send(`go ${go}`);
        const done = await this.waitFor((l) => l.startsWith('bestmove'), 60000);
        const move = done.split(' ')[1];
        return { bestmove: move && move !== '(none)' ? move : null, line: last };
      } finally {
        this.listeners.delete(collect);
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  // Ends the running search early; its promise still resolves.
  stop() {
    this.send('stop');
  }

  // Queued like a search, so it never lands in the middle of one.
  newGame() {
    const run = async () => {
      await this.ready;
      this.send('ucinewgame');
    };
    this.chain = this.chain.then(run, run).catch(() => {});
  }
}

let shared: Engine | null = null;
export function getEngine(): Engine {
  if (!shared || shared.failed) shared = new Engine();
  return shared;
}
