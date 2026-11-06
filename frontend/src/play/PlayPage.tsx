import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClipboardCopyIcon,
  CpuIcon,
  FlagIcon,
  FlipVerticalIcon,
  LightbulbIcon,
  Loader2Icon,
  TriangleAlertIcon,
  Undo2Icon,
  SwordsIcon,
  TrophyIcon,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Chessground } from '../components/Chessground';
import { PromotionOverlay, type PromoRole } from '../components/PromotionOverlay';
import { fenToDests, isPromotionMove } from '../util/chess';
import { MAX_ELO, MIN_ELO, ELO_STEP, usePlayStore } from './store';
import { MIN_UCI_ELO } from './engine';
import { isCheck, pgnResult, resultText, toPgn, turnOf, type Color, type Game } from './game';
import '../css/layout.css';
import '../components/UserTip.css';
import '../puzzles/PuzzlePage.css';
import './PlayPage.css';

const PROMO_LETTER: Record<PromoRole, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export function eloLabel(elo: number): string {
  if (elo >= MAX_ELO) return 'Max';
  return elo < MIN_UCI_ELO ? `≈${elo}` : String(elo);
}

export default function PlayPage() {
  const initEngine = usePlayStore((s) => s.initEngine);
  const setViewPly = usePlayStore((s) => s.setViewPly);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  // ← / → step through the game, Home / End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const { viewPly, fens } = usePlayStore.getState();
      const last = fens.length - 1;
      const cur = viewPly ?? last;
      if (e.key === 'ArrowLeft') setViewPly(cur - 1);
      else if (e.key === 'ArrowRight') setViewPly(cur + 1);
      else if (e.key === 'Home') setViewPly(0);
      else if (e.key === 'End') setViewPly(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setViewPly]);

  return (
    <div className="app-root">
      <Header />
      <div className="puzzle-main">
        <div className="puzzle-area-board">
          <PlayBoard />
        </div>
        <div className="puzzle-area-tip">
          <StatusTip />
        </div>
        <aside className="puzzle-area-side">
          <SetupPanel />
        </aside>
        <section className="puzzle-area-recent">
          <MovesPanel />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlayBoard() {
  const { game, fens, viewPly, engine, hint, move, flipped } = usePlayStore();
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const ply = viewPly ?? fens.length - 1;
  const fen = fens[ply];
  const player: Color = game?.playerColor ?? 'white';
  const orientation: Color = flipped ? (player === 'white' ? 'black' : 'white') : player;
  const live = viewPly == null;
  const canMove = !!game && !game.result && live && engine !== 'thinking' && turnOf(fen) === player;
  const lastUci = ply > 0 ? game?.moves[ply - 1] : undefined;
  const check = useMemo(() => isCheck(fen), [fen]);

  const shapes: DrawShape[] =
    hint && live && hint.ply === (game?.moves.length ?? -1)
      ? [{ orig: hint.uci.slice(0, 2) as Key, dest: hint.uci.slice(2, 4) as Key, brush: 'green' }]
      : [];

  return (
    <div className="board-card puzzle-board-card" ref={cardRef}>
      <Chessground
        dimensionsRef={cardRef}
        orientation={orientation}
        fen={fen}
        turnColor={turnOf(fen)}
        lastMove={lastUci ? [lastUci.slice(0, 2) as Key, lastUci.slice(2, 4) as Key] : undefined}
        check={check}
        movable={{
          free: false,
          color: canMove ? player : undefined,
          dests: canMove ? fenToDests(fen) : new Map(),
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => {
              if (isPromotionMove(fen, orig, dest)) setPromo({ from: orig, to: dest });
              else move(orig + dest);
            },
          },
        }}
        premovable={{ enabled: false }}
        drawable={{ autoShapes: shapes }}
      />
      {promo && (
        <PromotionOverlay
          dest={promo.to}
          color={player}
          onCancel={() => {
            setPromo(null);
            usePlayStore.setState((s) => ({ fens: [...s.fens] })); // redraw: put the pawn back
          }}
          onPick={(role) => {
            const { from, to } = promo;
            setPromo(null);
            move(from + to + PROMO_LETTER[role]);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tip(props: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: { label: React.ReactNode; onClick: () => void; disabled?: boolean }[];
}) {
  return (
    <div className="tip puzzle-tip">
      <div className="tip-main">
        <div className="tip-icon-slot">
          <div className="tip-icon is-boxed">{props.icon}</div>
        </div>
        <div className="tip-text">
          <span className="tip-title">{props.title}</span>
          {props.description && <span className="tip-description">{props.description}</span>}
        </div>
      </div>
      {props.actions && props.actions.length > 0 && (
        <div className="tip-actions">
          {props.actions.map((a, i) => (
            <button key={i} type="button" className="tip-action" onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusTip() {
  const { game, fens, sans, viewPly, engine, hint, hintLoading, newGame, takeback, resign, requestHint, setViewPly } =
    usePlayStore();

  if (engine === 'error')
    return (
      <Tip
        icon={<TriangleAlertIcon />}
        title="Stockfish failed to load"
        description="Reload the page to try again."
        actions={[{ label: 'RELOAD', onClick: () => window.location.reload() }]}
      />
    );
  if (!game)
    return (
      <Tip
        icon={<SwordsIcon />}
        title="Play a practice game"
        description="Pick Stockfish's strength and your colour, then start."
        actions={[{ label: 'START GAME', onClick: newGame }]}
      />
    );

  const side = game.playerColor === 'white' ? 'White' : 'Black';
  const moveCount = Math.ceil(game.moves.length / 2);

  if (viewPly != null)
    return (
      <Tip
        icon={<ChevronLeftIcon />}
        title={viewPly === 0 ? 'Start position' : `After ${Math.ceil(viewPly / 2)}${viewPly % 2 === 1 ? '.' : '…'} ${sans[viewPly - 1]}`}
        description="Use ← → to step through the game."
        actions={[{ label: 'BACK TO GAME', onClick: () => setViewPly(null) }]}
      />
    );

  if (game.result) {
    const won = game.result.winner === game.playerColor;
    return (
      <Tip
        icon={won ? <TrophyIcon className="puzzle-ok" /> : game.result.winner ? <FlagIcon /> : <SwordsIcon />}
        title={`${resultText(game.result, game.playerColor)} · ${pgnResult(game.result)}`}
        description={`${moveCount} move${moveCount === 1 ? '' : 's'} · ${game.hintsUsed} hint${game.hintsUsed === 1 ? '' : 's'} · ${game.takebacks} takeback${game.takebacks === 1 ? '' : 's'}`}
        actions={[{ label: 'NEW GAME', onClick: newGame }]}
      />
    );
  }

  const myTurn = turnOf(fens[fens.length - 1]) === game.playerColor;
  const actions = [
    {
      label: (
        <>
          <LightbulbIcon size={13} /> {hintLoading ? 'THINKING…' : 'HINT'}
        </>
      ),
      onClick: requestHint,
      disabled: !myTurn || engine !== 'ready' || hintLoading,
    },
    {
      label: (
        <>
          <Undo2Icon size={13} /> TAKEBACK
        </>
      ),
      onClick: takeback,
      disabled: game.moves.length === 0 || (game.playerColor === 'black' && game.moves.length < 2),
    },
    {
      label: (
        <>
          <FlagIcon size={13} /> RESIGN
        </>
      ),
      onClick: () => {
        if (window.confirm('Resign this game?')) resign();
      },
    },
  ];

  if (engine === 'loading')
    return <Tip icon={<Loader2Icon className="puzzle-spin" />} title="Loading Stockfish…" description="About 2 MB, only the first time." />;

  if (!myTurn)
    return (
      <Tip
        icon={<CpuIcon />}
        title="Stockfish is thinking…"
        description={`You play ${side} against Stockfish ${eloLabel(game.elo)}.`}
        actions={actions}
      />
    );

  return (
    <Tip
      icon={hint ? <LightbulbIcon /> : <SwordsIcon />}
      title={hint ? `Hint: ${hint.san}${hint.score ? ` (${hint.score})` : ''}` : 'Your move'}
      description={
        hint
          ? 'Best move at full strength; the evaluation is from your side.'
          : `You play ${side} against Stockfish ${eloLabel(game.elo)}.`
      }
      actions={actions}
    />
  );
}

// ---------------------------------------------------------------------------

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
      },
      () => window.prompt('Copy the PGN:', text),
    );
  };
  return { copied, copy };
}

function SetupPanel() {
  const { settings, updateSettings, newGame, game, history } = usePlayStore();
  const { copied, copy } = useCopy();
  const inProgress = !!game && !game.result && game.moves.length > 0;

  const start = () => {
    if (inProgress && !window.confirm('Abandon the current game and start a new one?')) return;
    newGame();
  };

  const record = useMemo(() => {
    let w = 0,
      d = 0,
      l = 0;
    for (const g of history) {
      if (!g.result) continue;
      if (!g.result.winner) d++;
      else if (g.result.winner === g.playerColor) w++;
      else l++;
    }
    return { w, d, l };
  }, [history]);

  return (
    <div className="puzzle-panel">
      <div className="puzzle-field">
        <span className="puzzle-label">Stockfish strength</span>
        <div className="play-elo">
          <input
            type="range"
            min={MIN_ELO}
            max={MAX_ELO}
            step={ELO_STEP}
            value={settings.elo}
            onChange={(e) => updateSettings({ elo: Number(e.target.value) })}
            aria-label="Stockfish Elo"
          />
          <span className="play-elo-value">{eloLabel(settings.elo)}</span>
        </div>
        <span className="puzzle-muted">
          {settings.elo >= MAX_ELO
            ? 'Full strength.'
            : settings.elo < MIN_UCI_ELO
              ? 'Below 1320 the level is approximate (reduced skill and depth).'
              : 'Stockfish limits itself to play at about this rating.'}
        </span>
      </div>

      <div className="puzzle-field">
        <span className="puzzle-label">Your colour</span>
        <div className="puzzle-seg" role="radiogroup" aria-label="Your colour">
          {(['white', 'random', 'black'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={settings.color === c}
              className={`puzzle-seg-btn ${settings.color === c ? 'is-active' : ''}`}
              onClick={() => updateSettings({ color: c })}
            >
              {c === 'white' ? 'White' : c === 'black' ? 'Black' : 'Random'}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="play-start" onClick={start}>
        <SwordsIcon size={16} /> {game ? 'New game' : 'Start game'}
      </button>

      <div className="puzzle-field">
        <span className="puzzle-label">Recent games</span>
        {history.length === 0 ? (
          <span className="puzzle-muted">Finished games are kept here (in this browser).</span>
        ) : (
          <>
            <span className="puzzle-muted">
              {record.w} won · {record.d} drawn · {record.l} lost
            </span>
            <ul className="play-history">
              {history.slice(0, 10).map((g) => (
                <HistoryRow key={g.id} game={g} copied={copied === g.id} onCopy={() => copy(g.id, toPgn(g))} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ game, copied, onCopy }: { game: Game; copied: boolean; onCopy: () => void }) {
  const r = game.result;
  const outcome = !r ? '·' : !r.winner ? '½' : r.winner === game.playerColor ? 'W' : 'L';
  return (
    <li>
      <span className={`play-outcome is-${outcome === 'W' ? 'win' : outcome === 'L' ? 'loss' : 'draw'}`}>{outcome}</span>
      <span className="play-history-main">
        {game.playerColor === 'white' ? 'White' : 'Black'} vs {eloLabel(game.elo)}
        <span className="puzzle-muted">
          {' '}· {Math.ceil(game.moves.length / 2)} move{Math.ceil(game.moves.length / 2) === 1 ? '' : 's'}
        </span>
      </span>
      <button type="button" className="play-icon-btn" onClick={onCopy} title="Copy PGN" aria-label="Copy PGN">
        {copied ? <ClipboardCheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function MovesPanel() {
  const { game, sans, viewPly, fens, setViewPly, toggleFlip } = usePlayStore();
  const { copied, copy } = useCopy();
  const listRef = useRef<HTMLOListElement>(null);
  const last = fens.length - 1;
  const current = viewPly ?? last;

  useEffect(() => {
    listRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [current, sans.length]);

  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([i / 2 + 1, sans[i], sans[i + 1]]);

  const cell = (san: string | undefined, ply: number) =>
    san ? (
      <button
        type="button"
        className={`play-move ${current === ply ? 'is-current' : ''}`}
        onClick={() => setViewPly(ply)}
      >
        {san}
      </button>
    ) : (
      <span />
    );

  return (
    <div className="puzzle-panel play-moves-panel">
      <div className="play-moves-head">
        <span className="puzzle-label">Moves</span>
        {game && game.moves.length > 0 && (
          <button type="button" className="play-icon-btn" onClick={() => copy('current', toPgn(game))} title="Copy PGN">
            {copied === 'current' ? <ClipboardCheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
            <span>PGN</span>
          </button>
        )}
      </div>
      {sans.length === 0 ? (
        <span className="puzzle-muted">No moves yet.</span>
      ) : (
        <ol className="play-moves" ref={listRef}>
          {rows.map(([n, w, b]) => (
            <li key={n}>
              <span className="play-move-no">{n}.</span>
              {cell(w, n * 2 - 1)}
              {cell(b, n * 2)}
            </li>
          ))}
        </ol>
      )}
      <div className="play-nav">
        <button type="button" onClick={() => setViewPly(0)} disabled={current === 0} aria-label="First move">
          <ChevronFirstIcon size={18} />
        </button>
        <button type="button" onClick={() => setViewPly(current - 1)} disabled={current === 0} aria-label="Previous move">
          <ChevronLeftIcon size={18} />
        </button>
        <button type="button" onClick={() => setViewPly(current + 1)} disabled={current >= last} aria-label="Next move">
          <ChevronRightIcon size={18} />
        </button>
        <button type="button" onClick={() => setViewPly(null)} disabled={current >= last} aria-label="Last move">
          <ChevronLastIcon size={18} />
        </button>
        <button type="button" onClick={toggleFlip} aria-label="Flip board" title="Flip board">
          <FlipVerticalIcon size={18} />
        </button>
      </div>
    </div>
  );
}
