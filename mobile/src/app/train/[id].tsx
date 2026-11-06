// Training screen.
// - learn: an arrow shows the next new move; play it to learn it (its card
//   is created). When a line runs out, offer to replay the whole line from
//   memory (quiz) before moving on, like the web app's learn loop.
// - recall: play the due move from memory. Right -> FSRS "Good"; wrong ->
//   FSRS "Again", the right move is shown and must be played to continue.
//   Another repertoire move from the same position is not counted.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from 'chessops';
import { Board, type Arrow } from '../../components/Board';
import { Button, Card } from '../../components/ui';
import { theme } from '../../components/theme';
import { useApp } from '../../store/app';
import { playSan, positionFromFen, sanToSquares, squaresToMove, type Square } from '../../core/chess';
import { createCard, reviewCard, dueAt } from '../../core/srs';
import { getNodeList } from '../../core/tree';
import { cardOf, formatDuration, nextDueIn, nextTrainable } from '../../core/training';
import { DEFAULT_NODE_SEARCH, type TrainableContext, type TrainingMethod } from '../../core/types';

type Phase = 'play' | 'fail' | 'lineDone' | 'quiz' | 'quizFail' | 'quizDone' | 'done';
type Feedback = { text: string; color: string } | null;

const SHOW_MOVE_MS = 450;

export default function Train() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode: TrainingMethod }>();
  const method: TrainingMethod = mode === 'learn' ? 'learn' : 'recall';
  const chapter = useApp((s) => s.chapter(id));
  const key = useApp((s) => s.key());
  const setCard = useApp((s) => s.setCard);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const boardSize = Math.floor(width / 8) * 8;

  const [ctx, setCtx] = useState<TrainableContext | null>(null);
  const [phase, setPhase] = useState<Phase>('play');
  const [lineEnd, setLineEnd] = useState('');
  const [quiz, setQuiz] = useState<{ queue: TrainableContext[]; total: number; mistakes: number }>({
    queue: [],
    total: 0,
    mistakes: 0,
  });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [hint, setHint] = useState(false);
  const [wrong, setWrong] = useState<[Square, Square] | null>(null);
  // the position right after the user's move, shown briefly before advancing
  const [shown, setShown] = useState<{ fen: string; lastMove: [Square, Square] } | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, learned: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const findNext = (m: TrainingMethod) => (chapter ? nextTrainable(chapter.root, m, key, DEFAULT_NODE_SEARCH) : null);

  const goTo = (next: TrainableContext | null, nextPhase: Phase = 'play') => {
    setHint(false);
    setWrong(null);
    if (!next) {
      setCtx(null);
      setPhase('done');
      return;
    }
    setCtx(next);
    setPhase(nextPhase);
  };

  // first position
  useEffect(() => {
    if (chapter && !ctx && phase === 'play') goTo(findNext(method));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.uuid]);

  // What the board shows.
  const view = useMemo(() => {
    if (!chapter) return null;
    if (shown) return { fen: shown.fen, lastMove: shown.lastMove, comment: '' };
    const path = phase === 'lineDone' || phase === 'quizDone' ? lineEnd : (ctx?.startingPath ?? '');
    const nodes = getNodeList(chapter.root, path);
    const node = nodes[nodes.length - 1];
    const parent = nodes[nodes.length - 2];
    const parentPos = parent && positionFromFen(parent.data.fen);
    const lastMove = parentPos ? sanToSquares(parentPos, node.data.san) : null;
    return { fen: node.data.fen, lastMove, comment: node.data.comment };
  }, [chapter, ctx, phase, lineEnd, shown]);

  const target = useMemo(() => {
    if (!ctx || !view || shown) return null;
    const pos = positionFromFen(view.fen);
    return pos ? sanToSquares(pos, ctx.targetMove.data.san) : null;
  }, [ctx, view, shown]);

  if (!chapter || !view) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Chapter not found.</Text>
        <Button title="Back to chapters" onPress={() => router.back()} />
      </View>
    );
  }

  const showThen = (fen: string, san: string, from: Square, to: Square, after: () => void) => {
    const pos = positionFromFen(fen);
    const next = pos ? playSan(pos, san) : null;
    if (next) setShown({ fen: next.fen, lastMove: [from, to] });
    timer.current = setTimeout(() => {
      setShown(null);
      after();
    }, SHOW_MOVE_MS);
  };

  const afterLearn = (learnedPath: string) => {
    const next = findNext('learn');
    // still inside the same line: keep going without a pause
    if (next && next.startingPath.startsWith(learnedPath)) return goTo(next);
    setLineEnd(learnedPath);
    setCtx(null);
    setPhase('lineDone');
  };

  const startQuiz = () => {
    const items: TrainableContext[] = [];
    let node = chapter.root;
    let path = '';
    for (let i = 0; i < lineEnd.length; i += 2) {
      const child = node.children.find((c) => c.data.id === lineEnd.slice(i, i + 2));
      if (!child) break;
      if (child.data.enabled) items.push({ startingPath: path, targetMove: child });
      path += child.data.id;
      node = child;
    }
    if (!items.length) return goTo(findNext('learn'));
    setQuiz({ queue: items.slice(1), total: items.length, mistakes: 0 });
    setFeedback(null);
    goTo(items[0], 'quiz');
  };

  const nextQuiz = () => {
    const [next, ...rest] = quiz.queue;
    if (!next) {
      setCtx(null);
      setPhase('quizDone');
      return;
    }
    setQuiz((q) => ({ ...q, queue: rest }));
    goTo(next, 'quiz');
  };

  const advanceRecall = () => goTo(findNext('recall'));

  const onMove = (from: Square, to: Square, promotion?: Role) => {
    if (!ctx || shown) return;
    const pos = positionFromFen(view.fen);
    const mv = pos && squaresToMove(pos, from, to, promotion);
    if (!mv) return;
    const t = ctx.targetMove;
    const targetPath = ctx.startingPath + t.data.id;
    const correct = mv.id === t.data.id;
    const fen = view.fen;

    if (phase === 'fail' || phase === 'quizFail') {
      if (!correct) return;
      showThen(fen, mv.san, from, to, phase === 'fail' ? advanceRecall : nextQuiz);
      return;
    }

    if (phase === 'play' && method === 'learn') {
      if (!correct) return;
      setCard(chapter.uuid, targetPath, createCard());
      setStats((s) => ({ ...s, learned: s.learned + 1 }));
      setFeedback(t.data.comment ? null : { text: `Learned: ${t.data.san}`, color: theme.success });
      showThen(fen, mv.san, from, to, () => afterLearn(targetPath));
      return;
    }

    if (phase === 'quiz') {
      // A move learned moments ago has never been reviewed: this first
      // answer is its first review (as on the web). Older moves on the
      // line are only practised, their schedule is kept.
      const card = cardOf(t.data, key);
      if (card && card.reps === 0) setCard(chapter.uuid, targetPath, reviewCard(card, correct));
      if (correct) {
        setFeedback({ text: 'Correct!', color: theme.success });
        showThen(fen, mv.san, from, to, nextQuiz);
      } else {
        setQuiz((q) => ({ ...q, mistakes: q.mistakes + 1 }));
        setWrong([from, to]);
        setFeedback({ text: `Not it. The move is ${t.data.san}: play it along the red arrow.`, color: theme.danger });
        setPhase('quizFail');
      }
      return;
    }

    // recall
    const parent = getNodeList(chapter.root, ctx.startingPath).pop();
    const isAlternate = !correct && parent?.children.some((c) => c.data.id === mv.id);
    if (isAlternate) {
      setFeedback({ text: `${mv.san} is also in the repertoire, but another move is being reviewed here. Try again.`, color: theme.warn });
      return;
    }
    const card = cardOf(t.data, key) ?? createCard();
    const reviewed = reviewCard(card, correct);
    setCard(chapter.uuid, targetPath, reviewed);
    setStats((s) => ({ ...s, reviewed: s.reviewed + 1, correct: s.correct + (correct ? 1 : 0) }));
    if (correct) {
      setFeedback({ text: `Correct! Next review in ${formatDuration(dueAt(reviewed) - Date.now())}.`, color: theme.success });
      showThen(fen, mv.san, from, to, advanceRecall);
    } else {
      setWrong([from, to]);
      setFeedback({ text: `Wrong. The move is ${t.data.san}: play it to continue.`, color: theme.danger });
      setPhase('fail');
    }
  };

  const arrows: Arrow[] = [];
  if (target && phase === 'play' && method === 'learn') arrows.push({ from: target[0], to: target[1], color: theme.arrowLearn });
  if (target && (phase === 'fail' || phase === 'quizFail')) arrows.push({ from: target[0], to: target[1], color: theme.arrowFail });
  if (target && hint && (phase === 'play' || phase === 'quiz')) arrows.push({ from: target[0], color: theme.arrowHint });

  const onlyMove = target && ((phase === 'play' && method === 'learn') || phase === 'fail' || phase === 'quizFail') ? target : null;
  const movable = !!ctx && !shown && ['play', 'fail', 'quiz', 'quizFail'].includes(phase);

  const comments = [view.comment, phase === 'play' && method === 'learn' ? ctx?.targetMove.data.comment : '']
    .filter(Boolean)
    .join('\n\n')
    .replace(/\|/g, '\n');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `${method === 'learn' ? 'Learn' : 'Recall'} · ${chapter.name}` }} />
      <Board
        fen={view.fen}
        orientation={chapter.trainAs}
        size={boardSize}
        lastMove={view.lastMove}
        arrows={arrows}
        marks={wrong ? wrong.map((s) => ({ square: s, color: theme.wrongSquare })) : undefined}
        movable={movable}
        onlyMove={onlyMove}
        onMove={onMove}
      />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 20 + insets.bottom }}>
        <Text style={styles.progress}>
          {method === 'learn'
            ? `${chapter.unseenCount} moves to learn · ${stats.learned} learned this session`
            : `${chapter.lastDueCount} moves due · ${stats.correct}/${stats.reviewed} correct`}
        </Text>

        <Prompt
          phase={phase}
          method={method}
          san={ctx?.targetMove.data.san}
          quiz={quiz}
          nextDue={phase === 'done' ? nextDueIn(chapter, key) : null}
        />

        {feedback && <Text style={[styles.feedback, { color: feedback.color }]}>{feedback.text}</Text>}

        <View style={styles.row}>
          {(phase === 'play' && method === 'recall') || phase === 'quiz' ? (
            <Button kind="secondary" title={hint ? 'Hint shown' : 'Hint'} disabled={hint} onPress={() => setHint(true)} style={{ flex: 1 }} />
          ) : null}
          {phase === 'lineDone' && (
            <>
              <Button title="Test the line" onPress={startQuiz} style={{ flex: 1 }} />
              <Button kind="secondary" title="Keep learning" onPress={() => goTo(findNext('learn'))} style={{ flex: 1 }} />
            </>
          )}
          {phase === 'quizDone' && <Button title="Keep learning" onPress={() => goTo(findNext('learn'))} style={{ flex: 1 }} />}
          {phase === 'done' && <Button title="Back to chapters" onPress={() => router.back()} style={{ flex: 1 }} />}
        </View>

        {!!comments && (
          <Card>
            <Text style={styles.comment}>{comments}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Prompt({
  phase,
  method,
  san,
  quiz,
  nextDue,
}: {
  phase: Phase;
  method: TrainingMethod;
  san?: string;
  quiz: { queue: TrainableContext[]; total: number; mistakes: number };
  nextDue: number | null;
}) {
  let text = '';
  switch (phase) {
    case 'play':
      text = method === 'learn' ? `Play the move on the green arrow: ${san}` : 'Your turn: recall the repertoire move.';
      break;
    case 'fail':
    case 'quizFail':
      text = 'Play the correct move along the red arrow.';
      break;
    case 'lineDone':
      text = 'Line complete. Test the whole line from the start, without arrows?';
      break;
    case 'quiz':
      text = `Memory check: move ${quiz.total - quiz.queue.length}/${quiz.total}, play your move.`;
      break;
    case 'quizDone':
      text = `Check done: ${quiz.total - quiz.mistakes}/${quiz.total} moves correct.`;
      break;
    case 'done':
      text =
        method === 'learn'
          ? 'All new moves in this chapter are learned.'
          : nextDue != null
            ? `Nothing due. The next move is due in ${formatDuration(nextDue)}.`
            : 'Nothing due.';
      break;
  }
  return <Text style={styles.prompt}>{text}</Text>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: theme.muted },
  progress: { color: theme.muted, fontSize: 13 },
  prompt: { fontSize: 16, fontWeight: '600', color: theme.text },
  feedback: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10 },
  comment: { color: theme.text, fontSize: 15, lineHeight: 21 },
});
