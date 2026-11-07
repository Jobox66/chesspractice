import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleHelpIcon,
  CloudIcon,
  ExternalLinkIcon,
  EyeIcon,
  HardDriveIcon,
  LightbulbIcon,
  Loader2Icon,
  PuzzleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Header } from '../components/Header';
import { Chessground } from '../components/Chessground';
import { PromotionOverlay, type PromoRole } from '../components/PromotionOverlay';
import { useAuthStore } from '../store/auth';
import { fenToDests, isPromotionMove } from '../util/chess';
import { DIFFICULTY_OFFSET, usePuzzleStore, duePuzzles, type Difficulty, type Run } from './store';
import { SKILL_THEMES, themeLabel } from './themes';
import { TopicPicker } from './TopicPicker';
import { ratingSeries, themeCounts, todayStats, weakThemes } from './stats';
import { RatingSparkline } from './RatingSparkline';
import '../css/layout.css';
import '../components/UserTip.css';
import './PuzzlePage.css';

const PROMO_LETTER: Record<PromoRole, string> = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

function solverColor(run: Run): 'white' | 'black' {
  // The file's FEN is before the opponent's move, so the solver is the
  // side *not* to move in it.
  return run.puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white';
}

export default function PuzzlePage() {
  const authUser = useAuthStore((s) => s.user);
  const authChecked = useAuthStore((s) => s.checked);
  const { setStatus, progressStatus, run, empty } = usePuzzleStore();

  useEffect(() => {
    void usePuzzleStore.getState().loadSet();
  }, []);

  // Whose progress: wait for the startup session check, then reload
  // whenever the signed-in user changes (log in / log out).
  const username = authUser?.username ?? null;
  useEffect(() => {
    if (!authChecked && !username) return;
    void usePuzzleStore.getState().loadProgress(username);
  }, [authChecked, username]);

  // First puzzle once both the set and the progress are in.
  useEffect(() => {
    if (setStatus === 'ready' && progressStatus === 'ready' && !run && !empty) usePuzzleStore.getState().next();
  }, [setStatus, progressStatus, run, empty]);

  return (
    <div className="app-root">
      <Header />
      {setStatus === 'missing' ? (
        <MissingSet />
      ) : setStatus === 'error' ? (
        <CenterNote icon={<TriangleAlertIcon />} title="Couldn't load the puzzles" text="Check your connection and reload the page." />
      ) : setStatus !== 'ready' || progressStatus !== 'ready' ? (
        <CenterNote icon={<Loader2Icon className="puzzle-spin" />} title="Loading puzzles…" text="" />
      ) : (
        <div className="puzzle-main">
          <div className="puzzle-area-board">
            <PuzzleBoard />
          </div>
          <div className="puzzle-area-tip">
            <PuzzleTip />
          </div>
          <aside className="puzzle-area-side">
            <SidePanel />
          </aside>
          <section className="puzzle-area-recent">
            <RecentPanel />
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PuzzleBoard() {
  const run = usePuzzleStore((s) => s.run);
  const move = usePuzzleStore((s) => s.move);
  const [promo, setPromo] = useState<{ from: Key; to: Key } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const fen = run?.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1';
  const turn = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const color = run ? solverColor(run) : 'white';
  const canMove = run?.phase === 'play';

  const inCheck = useMemo(() => {
    const pos = parseFen(fen).chain((setup) => Chess.fromSetup(setup));
    return pos.isOk && pos.unwrap().isCheck();
  }, [fen]);

  const shapes: DrawShape[] = run?.hint ? [{ orig: run.hint, brush: 'green' }] : [];

  return (
    <div className="board-card puzzle-board-card" ref={cardRef}>
      <Chessground
        dimensionsRef={cardRef}
        orientation={color}
        fen={fen}
        turnColor={turn}
        lastMove={run?.lastMove ?? undefined}
        check={inCheck}
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
            // put the pawn back: re-render from the store's position
            usePuzzleStore.setState((s) => ({ run: s.run && { ...s.run } }));
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
  boxed?: boolean;
  actions?: { label: React.ReactNode; onClick?: () => void; href?: string; disabled?: boolean }[];
}) {
  const { icon, title, description, boxed = true, actions } = props;
  return (
    <div className="tip puzzle-tip">
      <div className="tip-main">
        <div className="tip-icon-slot">
          <div className={`tip-icon ${boxed ? 'is-boxed' : ''}`}>{icon}</div>
        </div>
        <div className="tip-text">
          <span className="tip-title">{title}</span>
          {description && <span className="tip-description">{description}</span>}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="tip-actions">
          {actions.map((a, i) =>
            a.href ? (
              <a key={i} className="tip-action puzzle-tip-link" href={a.href} target="_blank" rel="noopener noreferrer">
                {a.label}
              </a>
            ) : (
              <button key={i} type="button" className="tip-action" onClick={a.onClick} disabled={a.disabled}>
                {a.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function RatingDelta({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  return (
    <span className={`puzzle-delta ${delta >= 0 ? 'is-up' : 'is-down'}`}>
      {delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}
    </span>
  );
}

function PuzzleTip() {
  const { run, empty, next, retry, hint, showSolution, updateSettings, settings, progress } = usePuzzleStore();

  if (!run) {
    if (empty === 'review') {
      const waiting = Object.values(progress)
        .filter((p) => p.card)
        .map((p) => p.card!.due.getTime())
        .sort((a, b) => a - b);
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title="Nothing to review right now"
          description={
            waiting.length
              ? `${waiting.length} missed puzzle${waiting.length === 1 ? '' : 's'} scheduled, the next one due ${new Date(waiting[0]).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
              : 'Puzzles you miss come back here on a review schedule.'
          }
          actions={[{ label: 'NEW PUZZLES', onClick: () => updateSettings({ mode: 'rated' }) }]}
        />
      );
    }
    if (empty === 'exhausted')
      return (
        <Tip
          icon={<CheckCircle2Icon />}
          title="No puzzles left"
          description={settings.theme ? `You've done every "${themeLabel(settings.theme)}" puzzle.` : "You've done every puzzle in the set."}
          actions={settings.theme ? [{ label: 'CLEAR THEME', onClick: () => updateSettings({ theme: null }) }] : []}
        />
      );
    return null;
  }

  const side = solverColor(run) === 'white' ? 'White' : 'Black';
  const lichess = { label: <>LICHESS <ExternalLinkIcon size={12} /></>, href: `https://lichess.org/training/${run.puzzle.id}` };
  const meta = (
    <>
      Puzzle {run.puzzle.rating} · {run.puzzle.themes.filter((t) => SKILL_THEMES.has(t)).map(themeLabel).join(', ') || 'tactics'}
    </>
  );

  switch (run.phase) {
    case 'intro':
    case 'opponent':
      return <Tip icon={<PuzzleIcon />} title={run.phase === 'intro' ? 'Opponent to move…' : 'Correct!'} description={`You play ${side}.`} />;
    case 'play':
      return (
        <Tip
          icon={run.failed ? <XIcon className="tip-cross" /> : <PuzzleIcon />}
          title={run.failed ? 'Keep trying or view the solution' : run.step > 1 ? 'Keep going…' : 'Your turn'}
          description={
            run.failed
              ? 'This counts as a miss, but you can still find it yourself.'
              : `Find the best move for ${side}.${run.kind === 'review' ? ' (Review of a missed puzzle)' : ''}`
          }
          actions={[
            { label: <><LightbulbIcon size={13} /> HINT</>, onClick: hint, disabled: !!run.hint },
            { label: <><EyeIcon size={13} /> SOLUTION</>, onClick: showSolution },
          ]}
        />
      );
    case 'wrong':
      return (
        <Tip
          icon={<XIcon className="tip-cross" />}
          title={`${run.wrongSan} is not it`}
          description="This counts as a miss. Try another move."
        />
      );
    case 'solution':
      return <Tip icon={<EyeIcon />} title="Solution" description="Playing the correct moves…" />;
    case 'done': {
      if (run.kind === 'practice')
        return (
          <Tip
            icon={run.failed ? <EyeIcon /> : <CheckCircle2Icon />}
            title={run.failed ? 'Solution shown' : 'Solved again!'}
            description={<>Replays are not rated. {meta}</>}
            actions={[{ label: 'NEXT', onClick: next }, { label: 'RETRY', onClick: retry }, lichess]}
          />
        );
      const success = !run.failed;
      return (
        <Tip
          icon={success ? <CheckCircle2Icon className="puzzle-ok" /> : <XIcon className="tip-cross" />}
          title={
            <>
              {success ? 'Correct!' : run.solved ? 'Solved, but counted as a miss' : 'Not solved'}{' '}
              <RatingDelta delta={run.ratingDelta} />
            </>
          }
          description={
            <>
              {meta}
              {!success && <><br />It will come back in “Review misses”.</>}
            </>
          }
          actions={[
            { label: 'NEXT', onClick: next },
            ...(success ? [] : [{ label: <><RotateCcwIcon size={12} /> RETRY</>, onClick: retry }]),
            lichess,
          ]}
        />
      );
    }
  }
}

// ---------------------------------------------------------------------------

function Segmented<T extends string | number>(props: {
  value: T;
  options: { value: T; label: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="puzzle-seg" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={`puzzle-seg-btn ${props.value === o.value ? 'is-active' : ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SidePanel() {
  const { set, progress, rating, attempts, settings, updateSettings, owner, syncError } = usePuzzleStore();
  const openLogin = useAuthStore((s) => s.openLogin);
  const counts = useMemo(() => (set ? themeCounts(set) : new Map<string, number>()), [set]);
  const dueCount = useMemo(() => (set ? duePuzzles(set, progress, null).length : 0), [set, progress]);
  const weak = useMemo(() => (set ? weakThemes(set, progress) : []), [set, progress]);
  const [picking, setPicking] = useState(false);
  const today = todayStats(attempts);
  const series = ratingSeries(attempts);
  const provisional = rating.rd > 110;

  return (
    <div className="puzzle-panel">
      <div className="puzzle-rating">
        <div className="puzzle-rating-head">
          <span className="puzzle-label">Puzzle rating</span>
          <span className="puzzle-rating-value">
            {Math.round(rating.rating)}
            {provisional && <span className="puzzle-rating-q" title="Provisional: needs a few more puzzles">?</span>}
          </span>
          <span className="puzzle-muted">{rating.games} rated puzzle{rating.games === 1 ? '' : 's'}</span>
        </div>
        <RatingSparkline points={series} />
      </div>

      <div className="puzzle-today">
        <span className="puzzle-label">Today</span>
        <span>
          <b>{today.solved}</b> solved · <b>{today.failed}</b> missed · <b>{today.minutes}</b> min
        </span>
      </div>

      <div className="puzzle-field">
        <span className="puzzle-label">Mode</span>
        <Segmented
          label="Mode"
          value={settings.mode}
          onChange={(mode) => updateSettings({ mode })}
          options={[
            { value: 'rated', label: 'New puzzles' },
            { value: 'review', label: <>Review misses{dueCount > 0 && <span className="puzzle-badge">{dueCount}</span>}</> },
          ]}
        />
      </div>

      {settings.mode === 'rated' && (
        <div className="puzzle-field">
          <span className="puzzle-label">Difficulty</span>
          <Segmented<Difficulty>
            label="Difficulty"
            value={settings.difficulty}
            onChange={(difficulty) => updateSettings({ difficulty })}
            options={[
              { value: -1, label: 'Easier' },
              { value: 0, label: 'Normal' },
              { value: 1, label: 'Harder' },
            ]}
          />
          <span className="puzzle-muted">
            Puzzles around {Math.round(rating.rating + settings.difficulty * DIFFICULTY_OFFSET)}
          </span>
        </div>
      )}

      <div className="puzzle-field">
        <span className="puzzle-label">Topic</span>
        <button type="button" className="puzzle-select puzzle-topic-btn" onClick={() => setPicking(true)}>
          <span>{settings.theme ? themeLabel(settings.theme) : 'All puzzles'}</span>
          <span className="puzzle-muted">{settings.theme ? counts.get(settings.theme) ?? 0 : set?.puzzles.length ?? 0}</span>
          <ChevronRightIcon size={16} />
        </button>
        {picking && <TopicPicker onClose={() => setPicking(false)} />}
      </div>

      {weak.length > 0 && (
        <div className="puzzle-field">
          <span className="puzzle-label">Themes to work on</span>
          <ul className="puzzle-weak">
            {weak.map((w) => (
              <li key={w.theme}>
                <button type="button" onClick={() => updateSettings({ theme: w.theme, mode: 'rated' })}>
                  <span>{themeLabel(w.theme)}</span>
                  <span className="puzzle-muted">
                    {Math.round(w.successRate * 100)}% of {w.attempts}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
          Puzzles from the{' '}
          <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener noreferrer">
            Lichess puzzle database
          </a>{' '}
          (CC0)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RecentPanel() {
  const { attempts, set, openPuzzle } = usePuzzleStore();
  const recent = attempts.slice(-12).reverse();

  return (
    <div className="puzzle-panel">
      <span className="puzzle-label">Recent</span>
      {recent.length === 0 ? (
        <span className="puzzle-muted">
          <CircleHelpIcon size={14} /> No puzzles yet. Results show up here; click one to replay it.
        </span>
      ) : (
        <ul className="puzzle-recent">
          {recent.map((a, i) => {
            const p = set?.byId.get(a.itemId);
            const skill = p?.themes.find((t) => SKILL_THEMES.has(t));
            return (
              <li key={`${a.at}-${i}`}>
                <button type="button" onClick={() => openPuzzle(a.itemId)} title="Replay this puzzle (not rated)">
                  {a.success ? <CheckCircle2Icon size={15} className="puzzle-ok" /> : <XIcon size={15} className="tip-cross" />}
                  <span className="puzzle-recent-theme">{skill ? themeLabel(skill) : 'Puzzle'}</span>
                  <span className="puzzle-muted">{p?.rating ?? ''}</span>
                  <span className="puzzle-muted puzzle-recent-r">{a.ratingAfter != null ? Math.round(a.ratingAfter) : 'review'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CenterNote({ icon, title, text }: { icon: React.ReactNode; title: string; text: React.ReactNode }) {
  return (
    <div className="puzzle-center">
      <div className="puzzle-center-icon">{icon}</div>
      <h2>{title}</h2>
      {text && <div className="puzzle-center-text">{text}</div>}
    </div>
  );
}

function MissingSet() {
  return (
    <CenterNote
      icon={<PuzzleIcon />}
      title="No puzzle set yet"
      text={
        <>
          <p>
            Bộ bài được tạo từ Lichess puzzle database bằng script, chạy trên máy có Internet (không bị chặn Lichess):
          </p>
          <pre>cd frontend{'\n'}npm run build-puzzles</pre>
          <p>
            Script ghi ra <code>frontend/public/puzzles/puzzles.json</code>. Commit file đó và push, trang này sẽ có bài.
          </p>
        </>
      }
    />
  );
}
