import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import {
  CheckCircle2Icon,
  CloudIcon,
  EyeIcon,
  HardDriveIcon,
  LightbulbIcon,
  Loader2Icon,
  MicroscopeIcon,
  RotateCcwIcon,
  SearchIcon,
  SwordsIcon,
  TargetIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Chessground } from '../components/Chessground';
import { PromotionOverlay, type PromoRole } from '../components/PromotionOverlay';
import { useAuthStore } from '../store/auth';
import { fenToDests, isPromotionMove } from '../util/chess';
import { navigate } from '../util/route';
import { usePlayStore } from '../play/store';
import { isCheck, turnOf } from '../play/game';
import { JUDGMENT_LABEL, JUDGMENT_SYMBOL } from '../play/analysis';
import { currentItems, isDue, useMistakeStore, type Run } from './store';
import { unanalysedGames, type MistakeItem } from './items';
import type { Progress } from '../puzzles/service';
import '../css/layout.css';
import '../components/UserTip.css';
import '../puzzles/PuzzlePage.css';
import '../play/PlayPage.css';
import './MistakesPage.css';

const PROMO_LETTER: Record<PromoRole, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
const LIST_SIZE = 15;

const shortDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// The library's items, recomputed when the saved games change.
function useItems(): MistakeItem[] {
  const history = usePlayStore((s) => s.history);
  return useMemo(() => {
    void history;
    return currentItems();
  }, [history]);
}

function itemStatus(p: Progress | undefined, now = Date.now()): 'new' | 'due' | 'learned' | 'learning' {
  if (!p?.card) return 'new';
  if (isDue(p, now)) return 'due';
  return p.lastSuccess ? 'learned' : 'learning';
}

export default function MistakesPage() {
  const authChecked = useAuthStore((s) => s.checked);
  const username = useAuthStore((s) => s.user?.username ?? null);
  const libraryStatus = usePlayStore((s) => s.libraryStatus);
  const libraryOwner = usePlayStore((s) => s.owner);
  const { progressStatus, run, empty } = useMistakeStore();
  const items = useItems();

  // The saved games (they hold the analyses) and the progress on their
  // mistakes, for whoever is signed in.
  useEffect(() => {
    if (!authChecked && !username) return;
    void usePlayStore.getState().loadLibrary(username);
    void useMistakeStore.getState().loadProgress(username);
  }, [authChecked, username]);

  const ready = progressStatus === 'ready' && libraryStatus === 'ready' && libraryOwner === username;

  // First exercise; and again when new mistakes appear (a game was analysed).
  useEffect(() => {
    if (!ready || run) return;
    if (!empty || (empty === 'none' && items.length > 0)) useMistakeStore.getState().next();
  }, [ready, run, empty, items.length]);

  return (
    <div className="app-root">
      <Header />
      {!ready ? (
        <div className="puzzle-center">
          <div className="puzzle-center-icon">
            <Loader2Icon className="puzzle-spin" />
          </div>
          <h2>Loading your games…</h2>
        </div>
      ) : (
        <div className="puzzle-main mistakes-main">
          <div className="puzzle-area-board">
            <MistakeBoard />
          </div>
          <div className="puzzle-area-tip">
            <MistakeTip />
          </div>
          <aside className="puzzle-area-side">
            <SidePanel />
          </aside>
          <section className="puzzle-area-recent">
            <ListPanel />
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MistakeBoard() {
  const run = useMistakeStore((s) => s.run);
  const move = useMistakeStore((s) => s.move);
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const fen = run?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1';
  const color = run?.item.color ?? 'white';
  const canMove = run?.phase === 'play';
  const check = useMemo(() => (run ? isCheck(fen) : false), [run, fen]);

  const shapes: DrawShape[] = [];
  if (run) {
    const arrow = (uci: string, brush: string): DrawShape => ({
      orig: uci.slice(0, 2) as Key,
      dest: uci.slice(2, 4) as Key,
      brush,
    });
    if (run.phase === 'play' && run.hinted) shapes.push({ orig: run.item.best.slice(0, 2) as Key, brush: 'green' });
    if (run.phase === 'done' && run.outcome) {
      if (!run.outcome.ok) {
        if (run.tried) shapes.push(arrow(run.tried, 'red'));
        shapes.push(arrow(run.item.best, 'green'));
      } else if (run.outcome.reason === 'good') {
        // Your move is on the board; Stockfish's choice for comparison.
        shapes.push(arrow(run.item.best, 'paleBlue'));
      }
    }
  }

  return (
    <div className="board-card puzzle-board-card" ref={cardRef}>
      <Chessground
        dimensionsRef={cardRef}
        orientation={color}
        fen={fen}
        turnColor={turnOf(fen)}
        lastMove={run?.lastMove ?? undefined}
        check={check}
        movable={{
          free: false,
          color: canMove ? color : undefined,
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
          color={color}
          onCancel={() => {
            setPromo(null);
            useMistakeStore.setState((s) => ({ run: s.run && { ...s.run } })); // redraw: put the pawn back
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
  const { icon, title, description, actions } = props;
  return (
    <div className="tip puzzle-tip">
      <div className="tip-main">
        <div className="tip-icon-slot">
          <div className="tip-icon is-boxed">{icon}</div>
        </div>
        <div className="tip-text">
          <span className="tip-title">{title}</span>
          {description && <span className="tip-description">{description}</span>}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="tip-actions">
          {actions.map((a, i) => (
            <button key={i} type="button" className="tip-action" onClick={a.onClick} disabled={a.disabled}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Judged({ item }: { item: MistakeItem }) {
  return (
    <>
      {item.moveLabel} {item.playedSan}
      <span className={`play-judgment is-${item.judgment}`}>{JUDGMENT_SYMBOL[item.judgment]}</span>
    </>
  );
}

export function viewInGame(item: MistakeItem) {
  navigate('play');
  const play = usePlayStore.getState();
  play.openGame(item.gameId);
  play.setViewPly(item.ply);
}

function gameLine(item: MistakeItem) {
  return `From your game vs Stockfish ${item.opponentElo}, ${shortDate(item.playedAt)}.`;
}

function scheduleNote(run: Run, progress: Progress | undefined): string {
  if (run.kind === 'practice') return 'Practice: not recorded.';
  const due = progress?.card?.due;
  if (!due) return '';
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? 'It comes back later today.' : days === 1 ? 'Next review tomorrow.' : `Next review in ${days} days.`;
}

function MistakeTip() {
  const { run, empty, next, retry, hint, showAnswer, progress, analyseAll, batch } = useMistakeStore();
  const history = usePlayStore((s) => s.history);
  const pending = useMemo(() => unanalysedGames(history).length, [history]);

  if (!run) {
    if (empty === 'caughtUp') {
      const waiting = Object.values(progress)
        .filter((p) => p.card)
        .map((p) => p.card!.due.getTime())
        .sort((a, b) => a - b);
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title="All caught up"
          description={
            <>
              {waiting.length > 0 && <>Next review {shortDate(new Date(waiting[0]))}. </>}
              New mistakes from your analysed games show up here. You can practise any of them from the list.
            </>
          }
          actions={pending > 0 && !batch ? [{ label: <><MicroscopeIcon size={13} /> ANALYSE {pending} GAME{pending === 1 ? '' : 'S'}</>, onClick: analyseAll }] : []}
        />
      );
    }
    if (empty === 'none') {
      if (pending > 0)
        return (
          <Tip
            icon={<MicroscopeIcon />}
            title="Analyse your games first"
            description={`${pending} saved game${pending === 1 ? ' has' : 's have'} no analysis yet. Stockfish finds your mistakes and blunders, and each one becomes an exercise here.`}
            actions={batch ? [] : [{ label: <><MicroscopeIcon size={13} /> ANALYSE {pending} GAME{pending === 1 ? '' : 'S'}</>, onClick: analyseAll }]}
          />
        );
      if (history.length === 0)
        return (
          <Tip
            icon={<SwordsIcon />}
            title="No games yet"
            description="Play a game against Stockfish. Once it's analysed, your mistakes and blunders become exercises here."
            actions={[{ label: 'GO TO PLAY', onClick: () => navigate('play') }]}
          />
        );
      return (
        <Tip
          icon={<CheckCircle2Icon className="puzzle-ok" />}
          title="No mistakes found"
          description="Your analysed games have no mistakes or blunders. Play more and they'll show up here."
          actions={[{ label: 'GO TO PLAY', onClick: () => navigate('play') }]}
        />
      );
    }
    return null;
  }

  const { item } = run;
  const side = item.color === 'white' ? 'White' : 'Black';
  const view: TipAction = { label: <><SearchIcon size={12} /> VIEW GAME</>, onClick: () => viewInGame(item) };

  switch (run.phase) {
    case 'intro':
      return <Tip icon={<TargetIcon />} title="Opponent to move…" description={gameLine(item)} />;
    case 'play':
      return (
        <Tip
          icon={<TargetIcon />}
          title={<>Find a better move than <Judged item={item} /></>}
          description={
            <>
              You play {side}; before your move it was {item.evalBeforeText}. {gameLine(item)}
              {run.kind === 'due' && ' (Review)'}
              {run.kind === 'practice' && ' (Practice)'}
            </>
          }
          actions={[
            { label: <><LightbulbIcon size={13} /> HINT</>, onClick: hint, disabled: run.hinted },
            { label: <><EyeIcon size={13} /> SHOW ANSWER</>, onClick: showAnswer },
          ]}
        />
      );
    case 'checking':
      return (
        <Tip
          icon={<Loader2Icon className="puzzle-spin" />}
          title={`Checking ${run.triedSan}…`}
          description="Stockfish is looking at your move."
        />
      );
    case 'done': {
      const o = run.outcome!;
      const note = scheduleNote(run, progress[item.id]);
      const hinted = o.ok && run.hinted && run.kind !== 'practice' ? ' Counted as a miss because of the hint.' : '';
      const gameWas = (
        <>
          In the game: <Judged item={item} /> ({JUDGMENT_LABEL[item.judgment].toLowerCase()}, {item.evalBeforeText} → {item.evalAfterText}).
        </>
      );
      let icon = <CheckCircle2Icon className="puzzle-ok" />;
      let title: React.ReactNode;
      let description: React.ReactNode;
      switch (o.reason) {
        case 'best':
          title = `Correct! ${run.triedSan} is Stockfish's move`;
          description = gameWas;
          break;
        case 'mate':
          title = `Checkmate with ${run.triedSan}!`;
          description = gameWas;
          break;
        case 'good':
          title = `${run.triedSan} works too (${o.eval})`;
          description = <>Stockfish's choice was {item.bestSan} (blue arrow). {gameWas}</>;
          break;
        case 'same':
          icon = <XIcon className="tip-cross" />;
          title = `${run.triedSan} is what you played in the game`;
          description = <>{gameWas} Better was {item.bestSan}.</>;
          break;
        case 'worse':
          icon = <XIcon className="tip-cross" />;
          title = `${run.triedSan} isn't better (${o.eval})`;
          description = <>Better was {item.bestSan} (green arrow), keeping {item.evalBeforeText}. {gameWas}</>;
          break;
        case 'unchecked':
          icon = <TriangleAlertIcon />;
          title = `Couldn't check ${run.triedSan}`;
          description = <>The engine is unavailable. Stockfish's move was {item.bestSan}.</>;
          break;
        case 'shown':
          icon = <EyeIcon />;
          title = `Better was ${item.bestSan}`;
          description = <>It keeps {item.evalBeforeText}. {gameWas}</>;
          break;
      }
      return (
        <Tip
          icon={icon}
          title={title}
          description={
            <>
              {description}
              {(hinted || note) && (
                <>
                  <br />
                  {hinted.trim()} {note}
                </>
              )}
            </>
          }
          actions={[
            { label: 'NEXT', onClick: next },
            { label: <><RotateCcwIcon size={12} /> TRY AGAIN</>, onClick: retry },
            view,
          ]}
        />
      );
    }
  }
}

// ---------------------------------------------------------------------------

function SidePanel() {
  const { progress, attempts, owner, syncError, batch, analyseAll, cancelBatch, engineError } = useMistakeStore();
  const openLogin = useAuthStore((s) => s.openLogin);
  const history = usePlayStore((s) => s.history);
  const items = useItems();
  const pending = useMemo(() => unanalysedGames(history).length, [history]);

  const counts = useMemo(() => {
    const c = { due: 0, new: 0, learning: 0, learned: 0 };
    const now = Date.now();
    for (const i of items) c[itemStatus(progress[i.id], now)]++;
    return c;
  }, [items, progress]);
  const blunders = items.filter((i) => i.judgment === 'blunder').length;

  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t = attempts.filter((a) => new Date(a.at) >= start);
    return { done: t.length, right: t.filter((a) => a.success).length };
  }, [attempts]);

  return (
    <div className="puzzle-panel">
      <div className="puzzle-field">
        <span className="puzzle-label">Your mistakes</span>
        <span className="mistakes-total">
          {items.length}
          <span className="puzzle-muted">
            {' '}
            from {history.filter((g) => g.analysis).length} analysed game{history.filter((g) => g.analysis).length === 1 ? '' : 's'}
            {blunders > 0 && <> · {blunders} blunder{blunders === 1 ? '' : 's'}</>}
          </span>
        </span>
        <dl className="mistakes-counts">
          <div>
            <dt>Due</dt>
            <dd>{counts.due}</dd>
          </div>
          <div>
            <dt>New</dt>
            <dd>{counts.new}</dd>
          </div>
          <div>
            <dt>Learning</dt>
            <dd>{counts.learning}</dd>
          </div>
          <div>
            <dt>Learned</dt>
            <dd>{counts.learned}</dd>
          </div>
        </dl>
      </div>

      <div className="puzzle-today">
        <span className="puzzle-label">Today</span>
        <span>
          <b>{today.right}</b> right · <b>{today.done - today.right}</b> missed
        </span>
      </div>

      <div className="puzzle-field">
        <span className="puzzle-label">Analysis</span>
        {batch ? (
          <span>
            Analysing game {batch.gamesDone + 1} of {batch.games}…{' '}
            <button type="button" className="puzzle-inline-link" onClick={cancelBatch}>
              Cancel
            </button>
            <span className="play-progress">
              <span
                style={{
                  width: `${((batch.gamesDone + (batch.positions ? batch.positionsDone / batch.positions : 0)) / batch.games) * 100}%`,
                }}
              />
            </span>
          </span>
        ) : pending > 0 ? (
          <>
            <span className="puzzle-muted">
              {pending} saved game{pending === 1 ? ' is' : 's are'} not analysed yet (about {Math.max(1, Math.round((pending * 70 * 0.4) / 60))} min).
            </span>
            <button type="button" className="play-start" onClick={analyseAll}>
              <MicroscopeIcon size={15} /> Analyse {pending} game{pending === 1 ? '' : 's'}
            </button>
          </>
        ) : (
          <span className="puzzle-muted">All saved games are analysed.</span>
        )}
        {engineError && (
          <span className="puzzle-sync-error">
            <TriangleAlertIcon size={14} /> Stockfish failed to run. Reload the page to try again.
          </span>
        )}
      </div>

      <div className="puzzle-sync">
        {owner ? (
          <span>
            <CloudIcon size={14} /> Synced to account {owner}
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
        <span className="puzzle-muted">
          Exercises are your mistakes (?) and blunders (??) from analysed games. A move other than Stockfish's counts if
          it loses less than an inaccuracy would.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const STATUS_LABEL = { new: 'new', due: 'due', learning: 'learning', learned: 'learned' } as const;

function ListPanel() {
  const { progress, run, practice } = useMistakeStore();
  const items = useItems();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_SIZE);

  return (
    <div className="puzzle-panel">
      <span className="puzzle-label">Mistakes</span>
      {items.length === 0 ? (
        <span className="puzzle-muted">Mistakes from analysed games are listed here; click one to practise it.</span>
      ) : (
        <>
          <ul className="puzzle-recent mistakes-list">
            {shown.map((item) => {
              const status = itemStatus(progress[item.id]);
              return (
                <li key={item.id} className={run?.item.id === item.id ? 'is-current' : ''}>
                  <button type="button" onClick={() => practice(item.id)} title="Practise this one (not recorded)">
                    <span className="puzzle-recent-theme">
                      <Judged item={item} />
                    </span>
                    <span className="puzzle-muted">{shortDate(item.playedAt)}</span>
                    <span className={`mistakes-status is-${status}`}>{STATUS_LABEL[status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {items.length > LIST_SIZE && (
            <button type="button" className="puzzle-inline-link" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
