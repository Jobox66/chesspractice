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
import {
  calculateMaterial,
  isCheck,
  pgnResult,
  resultText,
  toPgn,
  turnOf,
  type Color,
  type Game,
  type PieceRole,
} from './game';
import {
  accuracy,
  evalText,
  judgmentCounts,
  JUDGMENT_LABEL,
  JUDGMENT_SYMBOL,
  reviewMoves,
  terminalEval,
  winPct,
  type MoveReview,
  type Judgment,
  type Analysis,
} from './analysis';
import { detectOpening, type OpeningMatch } from './openings';
import { useTrainerStore } from '../store/state';
import { navigate } from '../util/route';
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

// Per-move review of the shown game: uses full engine analysis if available,
// or combines live evaluations and opening book detection during active play.
function useReviews(): MoveReview[] | null {
  const { game, fens, sans } = useShown();
  const liveEvals = usePlayStore((s) => s.liveEvals);
  return useMemo(() => {
    if (game?.analysis && game.analysis.evals.length === fens.length) {
      return reviewMoves(game.moves, fens, game.analysis, sans);
    }
    if (fens.length > 1) {
      const syntheticEvals: { cp: number | null; mate: number | null }[] = fens.map(
        (_, i) => liveEvals[i] ?? { cp: 0, mate: null },
      );
      const synthAnalysis: Analysis = {
        v: 1,
        movetime: 0,
        evals: syntheticEvals,
        best: new Array(fens.length).fill(''),
      };
      const playedMoves = game?.moves ?? [];
      return reviewMoves(playedMoves, fens, synthAnalysis, sans);
    }
    return null;
  }, [game, fens, sans, liveEvals]);
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

export function CapturedPieces(props: {
  pieces: PieceRole[];
  pieceColor: Color; // Color of the captured pieces ('white' | 'black')
  advantage?: number; // Advantage in material (> 0)
  compact?: boolean;
}) {
  const { pieces, pieceColor, advantage, compact } = props;
  if (pieces.length === 0 && (!advantage || advantage <= 0)) return null;

  return (
    <div className={`play-captured-wrap ${compact ? 'is-compact' : ''}`}>
      <div className="play-captured-list">
        {pieces.map((role, idx) => {
          const letter = role.toUpperCase();
          const prefix = pieceColor === 'white' ? 'w' : 'b';
          const src = `/images/pieces/merida/${prefix}${letter}.svg`;
          return (
            <img
              key={`${role}-${idx}`}
              src={src}
              alt={`${pieceColor} ${role}`}
              className="play-captured-img"
            />
          );
        })}
      </div>
      {advantage != null && advantage > 0 && (
        <span className="play-captured-adv">+{advantage}</span>
      )}
    </div>
  );
}

export function BoardJudgmentBadge(props: {
  judgment: Judgment;
  square: string;
  orientation: Color;
}) {
  const { judgment, square, orientation } = props;
  if (!square || square.length < 2) return null;

  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;

  const left = `calc(${col * 12.5}% + 12.5% - 1.25rem)`;
  const top = `calc(${row * 12.5}% - 0.35rem)`;

  const symbol = JUDGMENT_SYMBOL[judgment];
  const label = JUDGMENT_LABEL[judgment];

  return (
    <div
      className={`play-board-badge is-${judgment}`}
      style={{ left, top }}
      title={`${label} (${symbol}) on ${square}`}
      aria-label={`${label} on ${square}`}
    >
      <span className="play-badge-sym">{symbol}</span>
    </div>
  );
}

export function VerticalEvalBar(props: {
  eval: { cp: number | null; mate: number | null } | null;
  orientation: Color;
}) {
  const { eval: e, orientation } = props;
  if (!e) return null;

  const win = winPct(e);
  const whiteIsBottom = orientation === 'white';
  const whiteHeightPct = Math.max(4, Math.min(96, win));

  const bottomHeightPct = whiteIsBottom ? whiteHeightPct : 100 - whiteHeightPct;
  const topHeightPct = 100 - bottomHeightPct;

  const text = evalText(e, 'white');
  const isWhiteLead = (e.mate != null && e.mate > 0) || (e.cp != null && (e.cp > 0 || (e.cp === 0 && text.startsWith('+'))));
  const isBlackLead = (e.mate != null && e.mate < 0) || (e.cp != null && e.cp < 0);

  const displayText = useMemo(() => {
    if (e.mate != null) {
      return e.mate > 0 ? `M${e.mate}` : `M${Math.abs(e.mate)}`;
    }
    const val = (e.cp ?? 0) / 100;
    return Math.abs(val).toFixed(1);
  }, [e]);

  return (
    <div
      className="play-eval-bar"
      role="progressbar"
      aria-label={`Evaluation: ${text}`}
      title={`Evaluation: ${text} (${win.toFixed(0)}% White win chance)`}
    >
      <div
        className={`play-eval-segment is-top ${whiteIsBottom ? 'is-black' : 'is-white'}`}
        style={{ height: `${topHeightPct}%` }}
      >
        {((whiteIsBottom && isBlackLead) || (!whiteIsBottom && isWhiteLead)) && (
          <span className="play-eval-text is-top-text">{displayText}</span>
        )}
      </div>
      <div
        className={`play-eval-segment is-bottom ${whiteIsBottom ? 'is-white' : 'is-black'}`}
        style={{ height: `${bottomHeightPct}%` }}
      >
        {((whiteIsBottom && !isBlackLead) || (!whiteIsBottom && !isWhiteLead)) && (
          <span className="play-eval-text is-bottom-text">{displayText}</span>
        )}
      </div>
    </div>
  );
}

function BoardPlayerBar(props: {
  side: Color;
  isTop: boolean;
  name: string;
  elo?: number;
  isActiveTurn: boolean;
  isEngineThinking?: boolean;
  captured: PieceRole[];
  capturedColor: Color;
  advantage: number;
}) {
  const { side, isTop, name, elo, isActiveTurn, isEngineThinking, captured, capturedColor, advantage } = props;

  return (
    <div className={`play-player-bar ${isTop ? 'is-top' : 'is-bottom'} ${isActiveTurn ? 'is-active-turn' : ''}`}>
      <div className="play-player-meta">
        <span className={`play-color-dot is-${side}`} />
        <span className="play-player-name">{name}</span>
        {elo != null && <span className="play-player-elo">{eloLabel(elo)}</span>}
        {isEngineThinking && (
          <span className="play-thinking-indicator">
            <Loader2Icon size={12} className="play-spin" />
            <span>thinking…</span>
          </span>
        )}
      </div>
      <CapturedPieces pieces={captured} pieceColor={capturedColor} advantage={advantage} />
    </div>
  );
}

function PlayBoard() {
  const { game, fens } = useShown();
  const { viewPly, engine, hint, move, flipped, review, liveEvals } = usePlayStore();
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

  const topSide: Color = orientation === 'white' ? 'black' : 'white';
  const bottomSide: Color = orientation;

  const currentTurn = turnOf(fen);
  const material = useMemo(() => calculateMaterial(fen), [fen]);

  // Live evaluation fallback chain: analysis -> live Stockfish -> terminal -> material
  const currentEval = useMemo(() => {
    if (game?.analysis?.evals?.[ply]) return game.analysis.evals[ply];
    if (liveEvals?.[ply]) return liveEvals[ply];
    const term = terminalEval(fen);
    if (term) return term;
    return { cp: material.diff * 100, mate: null };
  }, [game?.analysis, liveEvals, ply, fen, material.diff]);

  const showEvalBar = true;

  const topIsUser = topSide === player;
  const topName = topIsUser ? 'You' : 'Stockfish';
  const topElo = topIsUser ? undefined : game?.elo;
  const topIsThinking = !topIsUser && engine === 'thinking' && currentTurn === topSide && !game?.result;

  const bottomIsUser = bottomSide === player;
  const bottomName = bottomIsUser ? 'You' : 'Stockfish';
  const bottomElo = bottomIsUser ? undefined : game?.elo;
  const bottomIsThinking = !bottomIsUser && engine === 'thinking' && currentTurn === bottomSide && !game?.result;

  const topCaptured = topSide === 'white' ? material.capturedByWhite : material.capturedByBlack;
  const topCapturedColor: Color = topSide === 'white' ? 'black' : 'white';
  const topAdvantage = topSide === 'white' ? material.diff : -material.diff;

  const bottomCaptured = bottomSide === 'white' ? material.capturedByWhite : material.capturedByBlack;
  const bottomCapturedColor: Color = bottomSide === 'white' ? 'black' : 'white';
  const bottomAdvantage = bottomSide === 'white' ? material.diff : -material.diff;

  const judgmentBadge = useMemo(() => {
    if (!reviews || ply <= 0 || !lastUci) return null;
    const rev = reviews[ply - 1];
    if (!rev?.judgment) return null;
    return {
      judgment: rev.judgment,
      square: lastUci.slice(2, 4),
    };
  }, [reviews, ply, lastUci]);

  const shapes: DrawShape[] = [];
  if (hint && live && hint.ply === (game?.moves.length ?? -1)) {
    shapes.push({ orig: hint.uci.slice(0, 2) as Key, dest: hint.uci.slice(2, 4) as Key, brush: 'green' });
  }

  // Reviewing / navigating moves: show the played move shape and best move on the board
  const r = reviews && ply > 0 ? reviews[ply - 1] : null;
  if (r) {
    if (r.judgment && lastUci) {
      const orig = lastUci.slice(0, 2) as Key;
      const dest = lastUci.slice(2, 4) as Key;
      let brush: 'red' | 'yellow' | 'green' | 'blue' = 'green';
      if (r.judgment === 'blunder') brush = 'red';
      else if (r.judgment === 'mistake' || r.judgment === 'inaccuracy') brush = 'yellow';
      else if (r.judgment === 'brilliant') brush = 'blue';
      shapes.push({ orig, dest, brush });
    }
    if (r.best) {
      const orig = r.best.slice(0, 2) as Key;
      const dest = r.best.slice(2, 4) as Key;
      shapes.push({ orig, dest, brush: 'green' });
    }
  }

  return (
    <div className="board-card puzzle-board-card play-board-card" ref={cardRef}>
      <BoardPlayerBar
        side={topSide}
        isTop={true}
        name={topName}
        elo={topElo}
        isActiveTurn={currentTurn === topSide && !game?.result}
        isEngineThinking={topIsThinking}
        captured={topCaptured}
        capturedColor={topCapturedColor}
        advantage={topAdvantage}
      />
      <div className="play-board-row">
        {showEvalBar && <VerticalEvalBar eval={currentEval} orientation={orientation} />}
        <div className="play-board-surface">
          <Chessground
            dimensionsRef={cardRef}
            orientation={orientation}
            fen={fen}
            turnColor={currentTurn}
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
          {judgmentBadge && (
            <BoardJudgmentBadge
              judgment={judgmentBadge.judgment}
              square={judgmentBadge.square}
              orientation={orientation}
            />
          )}
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
      </div>
      <BoardPlayerBar
        side={bottomSide}
        isTop={false}
        name={bottomName}
        elo={bottomElo}
        isActiveTurn={currentTurn === bottomSide && !game?.result}
        isEngineThinking={bottomIsThinking}
        captured={bottomCaptured}
        capturedColor={bottomCapturedColor}
        advantage={bottomAdvantage}
      />
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

function OpeningBanner({
  opening,
  onSelectChapter,
}: {
  opening: OpeningMatch | null;
  onSelectChapter: (id: string, name: string) => void;
}) {
  if (!opening) return null;

  return (
    <div className="play-opening-card">
      <div className="play-opening-main">
        <div className="play-opening-title-row">
          <span className="play-opening-eco">{opening.eco}</span>
          <span className="play-opening-name" title={opening.fullName}>
            {opening.name}
            {opening.variation && <span className="play-opening-var">: {opening.variation}</span>}
          </span>
          {opening.isInBook ? (
            <span className="play-opening-pill is-book" title="Nước đi thuộc sách lý thuyết khai cuộc">
              📖 Book
            </span>
          ) : (
            <span className="play-opening-pill is-out" title="Rời khỏi sách lý thuyết">
              ⚡ Out of Book
            </span>
          )}
        </div>

        {opening.chapter && (
          <div className="play-opening-chapter-row">
            <span className="play-opening-chapter-badge">
              <span className="play-curriculum-icon">📚</span>
              <span>Giáo trình: <strong>{opening.chapter.name}</strong></span>
            </span>
            <button
              type="button"
              className="play-opening-study-btn"
              onClick={() => onSelectChapter(opening.chapter!.id, opening.chapter!.name)}
              title="Luyện tập khai cuộc này trong Repertoire"
            >
              Luyện tập ↗
            </button>
          </div>
        )}

        {opening.chapter?.tip && (
          <div className="play-opening-tip">
            <span className="play-opening-tip-icon">💡</span>
            <span>{opening.chapter.tip}</span>
          </div>
        )}
      </div>
    </div>
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
  const currentFen = fens[current];
  const material = useMemo(() => (currentFen ? calculateMaterial(currentFen) : null), [currentFen]);

  const opening = useMemo(() => {
    const currentSans = sans.slice(0, current > 0 ? current : sans.length);
    return detectOpening(currentSans.length > 0 ? currentSans : sans);
  }, [sans, current]);

  const handleSelectChapter = (id: string, name: string) => {
    const repertoire = useTrainerStore.getState().repertoire;
    const match = repertoire.find(
      (c) =>
        c.uuid === id ||
        c.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(c.name.toLowerCase()),
    );
    if (match) {
      useTrainerStore.getState().setSelectedChapterId(match.uuid);
    }
    navigate('openings');
  };

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
        title={j ? `${JUDGMENT_LABEL[j]} (${JUDGMENT_SYMBOL[j]})` : undefined}
      >
        <span className={`play-move-pip is-${side}`} />
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

      <OpeningBanner opening={opening} onSelectChapter={handleSelectChapter} />
      {game && reviews && <AnalysisSummary reviews={reviews} player={game.playerColor} />}
      {graph && <EvalGraph points={graph.points} marks={graph.marks} current={current} onSelect={(p) => setViewPly(p)} />}

      {sans.length === 0 ? (
        <span className="puzzle-muted">No moves yet.</span>
      ) : (
        <>
          <div className="play-moves-col-header">
            <span className="play-col-no">#</span>
            <div className="play-col-banner is-white">
              <span className="play-color-dot is-white" />
              <span className="play-banner-title">WHITE</span>
              {material && (
                <CapturedPieces
                  pieces={material.capturedByWhite}
                  pieceColor="black"
                  advantage={material.diff}
                  compact
                />
              )}
              {game && (
                <span className={`play-role-pill ${player === 'white' ? 'is-user' : 'is-bot'}`}>
                  {player === 'white' ? 'You' : 'Bot'}
                </span>
              )}
            </div>
            <div className="play-col-banner is-black">
              <span className="play-color-dot is-black" />
              <span className="play-banner-title">BLACK</span>
              {material && (
                <CapturedPieces
                  pieces={material.capturedByBlack}
                  pieceColor="white"
                  advantage={-material.diff}
                  compact
                />
              )}
              {game && (
                <span className={`play-role-pill ${player === 'black' ? 'is-user' : 'is-bot'}`}>
                  {player === 'black' ? 'You' : 'Bot'}
                </span>
              )}
            </div>
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
  const whitePlayer = player === 'white' ? 'You' : 'Stockfish';
  const blackPlayer = player === 'black' ? 'You' : 'Stockfish';
  const whiteAcc = accuracy(reviews, 'white');
  const blackAcc = accuracy(reviews, 'black');
  const whiteJudgments = judgmentCounts(reviews, 'white');
  const blackJudgments = judgmentCounts(reviews, 'black');

  const renderJudgments = (c: Record<Judgment, number>) => (
    <div className="play-card-judgments">
      {c.brilliant > 0 && (
        <span className="play-card-j is-brilliant" title="Brilliant (Thiên tài)">
          <span className="play-j-sym">!!</span> {c.brilliant}
        </span>
      )}
      {c.best > 0 && (
        <span className="play-card-j is-best" title="Best moves (Nước tốt nhất)">
          <span className="play-j-sym">★</span> {c.best}
        </span>
      )}
      {c.good > 0 && (
        <span className="play-card-j is-good" title="Good moves (Nước tốt)">
          <span className="play-j-sym">✓</span> {c.good}
        </span>
      )}
      {c.book > 0 && (
        <span className="play-card-j is-book" title="Book moves (Lý thuyết)">
          <span className="play-j-sym">📖</span> {c.book}
        </span>
      )}
      <span className="play-card-j is-inaccuracy" title="Inaccuracies (Kém chính xác)">
        <span className="play-j-sym">?!</span> {c.inaccuracy}
      </span>
      <span className="play-card-j is-mistake" title="Mistakes (Sai lầm)">
        <span className="play-j-sym">?</span> {c.mistake}
      </span>
      <span className="play-card-j is-blunder" title="Blunders (Sai lầm nghiêm trọng)">
        <span className="play-j-sym">??</span> {c.blunder}
      </span>
    </div>
  );

  return (
    <div className="play-review-cards">
      {/* White Player Zone */}
      <div className="play-review-card is-white">
        <div className="play-card-header">
          <span className="play-color-dot is-white" />
          <span className="play-card-role">WHITE</span>
          <span className={`play-card-tag ${player === 'white' ? 'is-user' : 'is-bot'}`}>
            {whitePlayer}
          </span>
        </div>
        <div className="play-card-acc">
          <span className="play-card-acc-num">{whiteAcc != null ? `${whiteAcc}%` : '–'}</span>
          <span className="play-card-acc-label">Accuracy</span>
        </div>
        {renderJudgments(whiteJudgments)}
      </div>

      {/* Black Player Zone */}
      <div className="play-review-card is-black">
        <div className="play-card-header">
          <span className="play-color-dot is-black" />
          <span className="play-card-role">BLACK</span>
          <span className={`play-card-tag ${player === 'black' ? 'is-user' : 'is-bot'}`}>
            {blackPlayer}
          </span>
        </div>
        <div className="play-card-acc">
          <span className="play-card-acc-num">{blackAcc != null ? `${blackAcc}%` : '–'}</span>
          <span className="play-card-acc-label">Accuracy</span>
        </div>
        {renderJudgments(blackJudgments)}
      </div>
    </div>
  );
}
