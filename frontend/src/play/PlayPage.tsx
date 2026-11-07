import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import {
  ArrowLeftIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  ClipboardCopyIcon,
  CloudIcon,
  CpuIcon,
  FlagIcon,
  FlipVerticalIcon,
  HardDriveIcon,
  LightbulbIcon,
  Loader2Icon,
  MicroscopeIcon,
  SkipForwardIcon,
  SwordsIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TrophyIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Chessground } from '../components/Chessground';
import { PromotionOverlay, type PromoRole } from '../components/PromotionOverlay';
import { useAuthStore } from '../store/auth';
import { fenToDests, isPromotionMove } from '../util/chess';
import { MAX_ELO, MIN_ELO, ELO_STEP, usePlayStore, useShown } from './store';
import { MIN_UCI_ELO } from './engine';
import { isCheck, pgnResult, resultText, toPgn, turnOf, type Color, type Game } from './game';
import {
  accuracy,
  evalText,
  judgmentCounts,
  JUDGMENT_LABEL,
  JUDGMENT_SYMBOL,
  reviewMoves,
  winPct,
  type MoveReview,
} from './analysis';
import { EvalGraph } from './EvalGraph';
import '../css/layout.css';
import '../components/UserTip.css';
import '../puzzles/PuzzlePage.css';
import './PlayPage.css';

const PROMO_LETTER: Record<PromoRole, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

export function eloLabel(elo: number): string {
  if (elo >= MAX_ELO) return 'Max';
  return elo < MIN_UCI_ELO ? `≈${elo}` : String(elo);
}

// "14." / "14…" for the move that led to position `ply`.
function moveNo(ply: number): string {
  return ply % 2 === 1 ? `${(ply + 1) / 2}.` : `${ply / 2}…`;
}

// Per-move review of the shown game, when it has been analysed.
function useReviews(): MoveReview[] | null {
  const { game, fens } = useShown();
  return useMemo(
    () => (game?.analysis && game.analysis.evals.length === fens.length ? reviewMoves(game.moves, fens, game.analysis) : null),
    [game, fens],
  );
}

export default function PlayPage() {
  const initEngine = usePlayStore((s) => s.initEngine);
  const loadLibrary = usePlayStore((s) => s.loadLibrary);
  const setViewPly = usePlayStore((s) => s.setViewPly);
  const authChecked = useAuthStore((s) => s.checked);
  const username = useAuthStore((s) => s.user?.username ?? null);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  // Whose saved games: wait for the startup session check, then reload on
  // log in / log out.
  useEffect(() => {
    if (!authChecked && !username) return;
    void loadLibrary(username);
  }, [authChecked, username, loadLibrary]);

  // ← / → step through the game, Home / End jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      const s = usePlayStore.getState();
      const last = (s.review ?? s).fens.length - 1;
      const cur = s.viewPly ?? last;
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
      <div className="puzzle-main play-main">
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
  const { game, fens } = useShown();
  const { viewPly, engine, hint, move, flipped, review } = usePlayStore();
  const reviews = useReviews();
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const ply = viewPly ?? fens.length - 1;
  const fen = fens[ply];
  const player: Color = game?.playerColor ?? 'white';
  const orientation: Color = flipped ? (player === 'white' ? 'black' : 'white') : player;
  const live = !review && viewPly == null;
  const canMove = !!game && !game.result && live && engine !== 'thinking' && turnOf(fen) === player;
  const lastUci = ply > 0 ? game?.moves[ply - 1] : undefined;
  const check = useMemo(() => isCheck(fen), [fen]);

  const shapes: DrawShape[] = [];
  if (hint && live && hint.ply === (game?.moves.length ?? -1)) {
    shapes.push({ orig: hint.uci.slice(0, 2) as Key, dest: hint.uci.slice(2, 4) as Key, brush: 'green' });
  }
  // Reviewing: the better move for the move just played, from where it started.
  const r = reviews && ply > 0 ? reviews[ply - 1] : null;
  if (r?.judgment && r.best) {
    shapes.push({ orig: r.best.slice(0, 2) as Key, dest: r.best.slice(2, 4) as Key, brush: 'green' });
  }

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

type TipAction = { label: React.ReactNode; onClick: () => void; disabled?: boolean };

function Tip(props: { icon: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: TipAction[] }) {
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

// Next of your own judged moves after the current one (wraps around).
function nextMistake(reviews: MoveReview[], player: Color, current: number): number | null {
  const mine = reviews.filter((r) => r.mover === player && r.judgment);
  if (mine.length === 0) return null;
  return (mine.find((r) => r.ply > current) ?? mine[0]).ply;
}

function StatusTip() {
  const { game, fens, sans } = useShown();
  const s = usePlayStore();
  const { viewPly, engine, hint, hintLoading, review, analysing } = s;
  const reviews = useReviews();

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
        actions={[{ label: 'START GAME', onClick: s.newGame }]}
      />
    );

  const last = fens.length - 1;
  const ply = viewPly ?? last;
  const back: TipAction[] = review ? [{ label: <><ArrowLeftIcon size={13} /> BACK TO PLAY</>, onClick: s.closeReview }] : [];

  // ---- finished game: result, analysis and per-move review
  if (game.result) {
    if (analysing?.id === game.id)
      return (
        <Tip
          icon={<Loader2Icon className="puzzle-spin" />}
          title={`Analysing… ${analysing.done}/${analysing.total}`}
          description={
            <span className="play-progress" aria-hidden>
              <span style={{ width: `${(analysing.done / analysing.total) * 100}%` }} />
            </span>
          }
          actions={[{ label: 'CANCEL', onClick: s.cancelAnalysis }]}
        />
      );

    const next = reviews ? nextMistake(reviews, game.playerColor, ply) : null;
    const nextAction: TipAction[] =
      next != null ? [{ label: <><SkipForwardIcon size={13} /> NEXT MISTAKE</>, onClick: () => s.setViewPly(next) }] : [];

    if (reviews && viewPly != null && viewPly > 0) {
      const r = reviews[viewPly - 1];
      const who = r.mover === game.playerColor ? 'you' : 'Stockfish';
      const verdict = r.judgment ? JUDGMENT_LABEL[r.judgment] : r.best ? 'Good move' : 'Best move';
      return (
        <Tip
          icon={r.judgment ? <span className={`play-judgment-icon is-${r.judgment}`}>{JUDGMENT_SYMBOL[r.judgment]}</span> : <MicroscopeIcon />}
          title={
            <>
              {moveNo(viewPly)} {sans[viewPly - 1]}
              {r.judgment ? JUDGMENT_SYMBOL[r.judgment] : ''} · {verdict}
            </>
          }
          description={
            r.judgment && r.bestSan
              ? `Better was ${r.bestSan}. Evaluation for ${who}: ${r.evalBefore} → ${r.evalAfter}.`
              : `Evaluation for ${who}: ${r.evalAfter}.`
          }
          actions={[...nextAction, { label: 'SUMMARY', onClick: () => s.setViewPly(null) }, ...back]}
        />
      );
    }

    const won = game.result.winner === game.playerColor;
    const moves = Math.ceil(game.moves.length / 2);
    const acc = reviews ? accuracy(reviews, game.playerColor) : null;
    return (
      <Tip
        icon={won ? <TrophyIcon className="puzzle-ok" /> : game.result.winner ? <FlagIcon /> : <SwordsIcon />}
        title={`${resultText(game.result, game.playerColor)} · ${pgnResult(game.result)}`}
        description={
          acc != null
            ? `Your accuracy ${acc}%. Step through the moves or jump to your mistakes.`
            : `${moves} move${moves === 1 ? '' : 's'} · ${game.hintsUsed} hint${game.hintsUsed === 1 ? '' : 's'} · ${game.takebacks} takeback${game.takebacks === 1 ? '' : 's'}`
        }
        actions={[
          ...(game.analysis ? nextAction : [{ label: <><MicroscopeIcon size={13} /> ANALYSE</>, onClick: s.analyse, disabled: engine !== 'ready' && engine !== 'thinking' }]),
          ...(review ? back : [{ label: 'NEW GAME', onClick: s.newGame }]),
        ]}
      />
    );
  }

  // ---- game in progress
  const side = game.playerColor === 'white' ? 'White' : 'Black';
  if (viewPly != null)
    return (
      <Tip
        icon={<ChevronLeftIcon />}
        title={viewPly === 0 ? 'Start position' : `After ${moveNo(viewPly)} ${sans[viewPly - 1]}`}
        description="Use ← → to step through the game."
        actions={[{ label: 'BACK TO GAME', onClick: () => s.setViewPly(null) }]}
      />
    );

  const myTurn = turnOf(fens[last]) === game.playerColor;
  const actions: TipAction[] = [
    { label: <><LightbulbIcon size={13} /> {hintLoading ? 'THINKING…' : 'HINT'}</>, onClick: s.requestHint, disabled: !myTurn || engine !== 'ready' || hintLoading },
    {
      label: <><Undo2Icon size={13} /> TAKEBACK</>,
      onClick: s.takeback,
      disabled: game.moves.length === 0 || (game.playerColor === 'black' && game.moves.length < 2),
    },
    {
      label: <><FlagIcon size={13} /> RESIGN</>,
      onClick: () => {
        if (window.confirm('Resign this game?')) s.resign();
      },
    },
  ];

  if (engine === 'loading')
    return <Tip icon={<Loader2Icon className="puzzle-spin" />} title="Loading Stockfish…" description="About 2 MB, only the first time." />;

  if (!myTurn)
    return <Tip icon={<CpuIcon />} title="Stockfish is thinking…" description={`You play ${side} against Stockfish ${eloLabel(game.elo)}.`} actions={actions} />;

  return (
    <Tip
      icon={hint ? <LightbulbIcon /> : <SwordsIcon />}
      title={hint ? `Hint: ${hint.san}${hint.score ? ` (${hint.score})` : ''}` : 'Your move'}
      description={hint ? 'Best move at full strength; the evaluation is from your side.' : `You play ${side} against Stockfish ${eloLabel(game.elo)}.`}
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
  const { settings, updateSettings, newGame, game, history, review, owner, syncError, libraryStatus, openGame, deleteGame } =
    usePlayStore();
  const openLogin = useAuthStore((s) => s.openLogin);
  const { copied, copy } = useCopy();
  const [showAll, setShowAll] = useState(false);
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

  const openId = review?.game?.id ?? (game?.result ? game.id : null);
  const visible = showAll ? history : history.slice(0, 10);

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
              {c === 'white' ? (
                <span className="play-seg-label">
                  <span className="play-color-dot is-white" />
                  <span>White</span>
                </span>
              ) : c === 'black' ? (
                <span className="play-seg-label">
                  <span className="play-color-dot is-black" />
                  <span>Black</span>
                </span>
              ) : (
                'Random'
              )}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="play-start" onClick={start}>
        <SwordsIcon size={16} /> {game ? 'New game' : 'Start game'}
      </button>

      <div className="puzzle-field">
        <span className="puzzle-label">Saved games</span>
        {libraryStatus === 'loading' ? (
          <span className="puzzle-muted">Loading…</span>
        ) : history.length === 0 ? (
          <span className="puzzle-muted">Finished games are saved here for later review.</span>
        ) : (
          <>
            <span className="puzzle-muted">
              {record.w} won · {record.d} drawn · {record.l} lost
            </span>
            <ul className="play-history">
              {visible.map((g) => (
                <HistoryRow
                  key={g.id}
                  game={g}
                  open={g.id === openId}
                  copied={copied === g.id}
                  onOpen={() => openGame(g.id)}
                  onCopy={() => copy(g.id, toPgn(g))}
                  onDelete={() => {
                    if (window.confirm('Delete this game?')) deleteGame(g.id);
                  }}
                />
              ))}
            </ul>
            {history.length > 10 && (
              <button type="button" className="puzzle-inline-link" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${history.length}`}
              </button>
            )}
          </>
        )}
      </div>

      <div className="puzzle-sync">
        {owner ? (
          <span>
            <CloudIcon size={14} /> Games sync to account {owner}
          </span>
        ) : (
          <span>
            <HardDriveIcon size={14} /> Saved in this browser.{' '}
            <button type="button" className="puzzle-inline-link" onClick={openLogin}>
              Log in
            </button>{' '}
            to sync.
          </span>
        )}
        {syncError && (
          <span className="puzzle-sync-error">
            <TriangleAlertIcon size={14} /> {syncError}
          </span>
        )}
      </div>
    </div>
  );
}

function HistoryRow(props: {
  game: Game;
  open: boolean;
  copied: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const { game, open, copied, onOpen, onCopy, onDelete } = props;
  const r = game.result;
  const outcome = !r ? '·' : !r.winner ? '½' : r.winner === game.playerColor ? 'W' : 'L';
  const moves = Math.ceil(game.moves.length / 2);
  const date = new Date(game.endedAt ?? game.startedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return (
    <li className={open ? 'is-open' : ''}>
      <button type="button" className="play-history-open" onClick={onOpen} title="Review this game">
        <span className={`play-outcome is-${outcome === 'W' ? 'win' : outcome === 'L' ? 'loss' : 'draw'}`}>{outcome}</span>
        <span className="play-history-main">
          <span className={`play-color-dot is-${game.playerColor}`} />
          {game.playerColor === 'white' ? 'White' : 'Black'} vs {eloLabel(game.elo)}
          <span className="puzzle-muted">
            {' '}
            · {moves} move{moves === 1 ? '' : 's'} · {date}
          </span>
        </span>
        {game.analysis && <MicroscopeIcon size={13} className="play-history-analysed" aria-label="Analysed" />}
      </button>
      <button type="button" className="play-icon-btn" onClick={onCopy} title="Copy PGN" aria-label="Copy PGN">
        {copied ? <ClipboardCheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
      </button>
      <button type="button" className="play-icon-btn" onClick={onDelete} title="Delete game" aria-label="Delete game">
        <Trash2Icon size={14} />
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function MovesPanel() {
  const { game, sans, fens } = useShown();
  const { viewPly, setViewPly, toggleFlip, review, closeReview } = usePlayStore();
  const reviews = useReviews();
  const { copied, copy } = useCopy();
  const listRef = useRef<HTMLOListElement>(null);
  const last = fens.length - 1;
  const current = viewPly ?? last;

  useEffect(() => {
    listRef.current?.querySelector('.is-current')?.scrollIntoView({ block: 'nearest' });
  }, [current, sans.length]);

  const rows: [number, string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([i / 2 + 1, sans[i], sans[i + 1]]);

  const player: Color = game?.playerColor ?? 'white';

  const cell = (san: string | undefined, ply: number, side: 'white' | 'black') => {
    if (!san) return <span className="play-move-empty" />;
    const j = reviews?.[ply - 1]?.judgment;
    return (
      <button
        type="button"
        className={`play-move is-${side} ${current === ply ? 'is-current' : ''}`}
        onClick={() => setViewPly(ply)}
        title={j ? JUDGMENT_LABEL[j] : undefined}
      >
        <span className="play-move-san">{san}</span>
        {j && <span className={`play-judgment is-${j}`}>{JUDGMENT_SYMBOL[j]}</span>}
      </button>
    );
  };

  const graph = useMemo(() => {
    if (!game?.analysis || !reviews) return null;
    const points = game.analysis.evals.map((e, i) => ({
      win: winPct(e),
      label: i === 0 ? `Start ${evalText(e, 'white')}` : `${moveNo(i)} ${sans[i - 1]}  ${evalText(e, 'white')}`,
    }));
    const marks = reviews
      .filter((r) => r.mover === game.playerColor && r.judgment)
      .map((r) => ({ ply: r.ply, judgment: r.judgment! }));
    return { points, marks };
  }, [game, reviews, sans]);

  return (
    <div className="puzzle-panel play-moves-panel">
      <div className="play-moves-head">
        <span className="puzzle-label">{review ? 'Reviewing' : 'Moves'}</span>
        <span className="play-moves-tools">
          {game && game.moves.length > 0 && (
            <button type="button" className="play-icon-btn" onClick={() => copy('current', toPgn(game))} title="Copy PGN">
              {copied === 'current' ? <ClipboardCheckIcon size={14} /> : <ClipboardCopyIcon size={14} />}
              <span>PGN</span>
            </button>
          )}
          {review && (
            <button type="button" className="play-icon-btn" onClick={closeReview} title="Back to play" aria-label="Close review">
              <XIcon size={14} />
            </button>
          )}
        </span>
      </div>

      {game && reviews && <AnalysisSummary reviews={reviews} player={game.playerColor} />}
      {graph && <EvalGraph points={graph.points} marks={graph.marks} current={current} onSelect={(p) => setViewPly(p)} />}

      {sans.length === 0 ? (
        <span className="puzzle-muted">No moves yet.</span>
      ) : (
        <>
          <div className="play-moves-col-header">
            <span className="play-col-no">#</span>
            <span className="play-col-title is-white">
              <span className="play-color-dot is-white" />
              <span>White</span>
              {game && (
                <span className={`play-role-tag ${player === 'white' ? 'is-user' : 'is-bot'}`}>
                  {player === 'white' ? 'You' : 'Bot'}
                </span>
              )}
            </span>
            <span className="play-col-title is-black">
              <span className="play-color-dot is-black" />
              <span>Black</span>
              {game && (
                <span className={`play-role-tag ${player === 'black' ? 'is-user' : 'is-bot'}`}>
                  {player === 'black' ? 'You' : 'Bot'}
                </span>
              )}
            </span>
          </div>
          <ol className="play-moves" ref={listRef}>
            {rows.map(([n, w, b]) => (
              <li key={n}>
                <span className="play-move-no">{n}.</span>
                {cell(w, n * 2 - 1, 'white')}
                {cell(b, n * 2, 'black')}
              </li>
            ))}
          </ol>
        </>
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

function AnalysisSummary({ reviews, player }: { reviews: MoveReview[]; player: Color }) {
  const rows = [
    {
      who: player === 'white' ? 'You' : 'Stockfish',
      color: 'white' as Color,
      isUser: player === 'white',
      acc: accuracy(reviews, 'white'),
      c: judgmentCounts(reviews, 'white'),
    },
    {
      who: player === 'black' ? 'You' : 'Stockfish',
      color: 'black' as Color,
      isUser: player === 'black',
      acc: accuracy(reviews, 'black'),
      c: judgmentCounts(reviews, 'black'),
    },
  ];
  return (
    <table className="play-summary">
      <thead>
        <tr>
          <th className="play-summary-th-player">Player</th>
          <th>Accuracy</th>
          <th title="Inaccuracies">?!</th>
          <th title="Mistakes">?</th>
          <th title="Blunders">??</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.color}>
            <th scope="row" className="play-summary-who">
              <span className={`play-color-dot is-${r.color}`} />
              <span className="play-player-name">{r.who}</span>
              <span className={`play-side-badge is-${r.color}`}>
                {r.color === 'white' ? 'White' : 'Black'}
              </span>
            </th>
            <td className="play-summary-acc">{r.acc != null ? `${r.acc}%` : '–'}</td>
            <td>{r.c.inaccuracy}</td>
            <td>{r.c.mistake}</td>
            <td>{r.c.blunder}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
