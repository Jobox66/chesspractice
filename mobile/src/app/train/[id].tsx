// Training & Tree Explorer screen.
// - learn: an arrow shows the next new move; play it to learn it (its card
//   is created). When a line runs out, offer to replay the whole line from
//   memory (quiz) before moving on, like the web app's learn loop.
// - recall: play the due move from memory. Right -> FSRS "Good"; wrong ->
//   FSRS "Again", the right move is shown and must be played to continue.
// - explore: browse the chapter's PGN tree, play moves on the board to add
//   new branches, edit node comments, and delete variations.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from 'chessops';
import { Board, type Arrow } from '../../components/Board';
import { OpeningBanner } from '../../components/ChessWidgets';
import { Button, Card, Segmented } from '../../components/ui';
import { theme } from '../../components/theme';
import { useApp } from '../../store/app';
import { playSan, positionFromFen, sanToSquares, squaresToMove, colorFromPly, type Square } from '../../core/chess';
import { createCard, reviewCard, dueAt } from '../../../../shared/srs';
import { getNodeList } from '../../core/tree';
import { cardOf, formatDuration, nextDueIn, nextTrainable } from '../../core/training';
import { DEFAULT_NODE_SEARCH, type TrainableContext, type TrainableNode, type TrainingMethod } from '../../core/types';
import { detectOpening, isPlyInBook } from '../../../../shared/openings';

type ScreenMode = 'learn' | 'recall' | 'explore';
type Phase = 'play' | 'fail' | 'lineDone' | 'quiz' | 'quizFail' | 'quizDone' | 'done';
type Feedback = { text: string; color: string } | null;

const SHOW_MOVE_MS = 450;

export default function Train() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode: ScreenMode }>();
  const initialMode: ScreenMode = mode === 'learn' ? 'learn' : mode === 'explore' ? 'explore' : 'recall';
  const [screenMode, setScreenMode] = useState<ScreenMode>(initialMode);
  const method: TrainingMethod = screenMode === 'learn' ? 'learn' : 'recall';

  const chapter = useApp((s) => s.chapter(id));
  const key = useApp((s) => s.key());
  const setCard = useApp((s) => s.setCard);
  const addTreeMove = useApp((s) => s.addTreeMove);
  const setNodeComment = useApp((s) => s.setNodeComment);
  const deleteTreeNode = useApp((s) => s.deleteTreeNode);

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
  const [shown, setShown] = useState<{ fen: string; lastMove: [Square, Square] } | null>(null);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, learned: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tree explorer state
  const [explorePath, setExplorePath] = useState('');
  const [commentDraft, setCommentDraft] = useState('');

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

  useEffect(() => {
    if (!chapter) return;
    if (screenMode === 'learn' || screenMode === 'recall') {
      setFeedback(null);
      goTo(findNext(screenMode));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.uuid, screenMode]);

  const exploreNodes = useMemo(() => {
    if (!chapter) return [];
    return getNodeList(chapter.root, explorePath);
  }, [chapter, explorePath]);

  const currentExploreNode = exploreNodes[exploreNodes.length - 1];

  useEffect(() => {
    if (currentExploreNode) {
      setCommentDraft(currentExploreNode.data.comment ?? '');
    }
  }, [currentExploreNode]);

  // What the board shows in Learn/Recall mode
  const view = useMemo(() => {
    if (!chapter) return null;
    if (screenMode === 'explore') {
      const node = exploreNodes[exploreNodes.length - 1] ?? chapter.root;
      const parent = exploreNodes[exploreNodes.length - 2];
      const parentPos = parent && positionFromFen(parent.data.fen);
      const lastMove = parentPos ? sanToSquares(parentPos, node.data.san) : null;
      return { fen: node.data.fen, lastMove, comment: node.data.comment };
    }
    if (shown) return { fen: shown.fen, lastMove: shown.lastMove, comment: '' };
    const path = phase === 'lineDone' || phase === 'quizDone' ? lineEnd : (ctx?.startingPath ?? '');
    const nodes = getNodeList(chapter.root, path);
    const node = nodes[nodes.length - 1];
    const parent = nodes[nodes.length - 2];
    const parentPos = parent && positionFromFen(parent.data.fen);
    const lastMove = parentPos ? sanToSquares(parentPos, node.data.san) : null;
    return { fen: node.data.fen, lastMove, comment: node.data.comment };
  }, [chapter, screenMode, exploreNodes, ctx, phase, lineEnd, shown]);

  const activeLineSans = useMemo(() => {
    if (!chapter) return [];
    const path =
      screenMode === 'explore'
        ? explorePath
        : phase === 'lineDone' || phase === 'quizDone'
          ? lineEnd
          : (ctx?.startingPath ?? '');
    const nodes = getNodeList(chapter.root, path);
    return nodes.slice(1).map((n) => n.data.san);
  }, [chapter, screenMode, explorePath, phase, lineEnd, ctx]);

  const detectedOpening = useMemo(() => detectOpening(activeLineSans), [activeLineSans]);
  const inBookNow = useMemo(
    () => isPlyInBook(activeLineSans, activeLineSans.length),
    [activeLineSans],
  );

  const target = useMemo(() => {
    if (screenMode === 'explore' || !ctx || !view || shown) return null;
    const pos = positionFromFen(view.fen);
    return pos ? sanToSquares(pos, ctx.targetMove.data.san) : null;
  }, [screenMode, ctx, view, shown]);

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
    if (screenMode === 'explore') {
      const pos = positionFromFen(view.fen);
      const mv = pos && squaresToMove(pos, from, to, promotion);
      if (!mv || !pos) return;
      const next = playSan(pos, mv.san);
      if (!next) return;
      const parentPly = currentExploreNode?.data.ply ?? 0;
      const nextPly = parentPly + 1;
      const newNode: TrainableNode = {
        data: {
          id: mv.id,
          fen: next.fen,
          ply: nextPly,
          san: mv.san,
          comment: '',
          enabled: colorFromPly(nextPly) === chapter.trainAs,
          training: {},
        },
        children: [],
      };
      addTreeMove(chapter.uuid, explorePath, newNode);
      setExplorePath(explorePath + mv.id);
      return;
    }

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
  if (screenMode === 'explore' && currentExploreNode) {
    const pos = positionFromFen(view.fen);
    if (pos) {
      currentExploreNode.children.forEach((child, idx) => {
        const sqs = sanToSquares(pos, child.data.san);
        if (sqs) {
          arrows.push({
            from: sqs[0],
            to: sqs[1],
            color: idx === 0 ? theme.arrowLearn : theme.arrowHint,
          });
        }
      });
    }
  } else {
    if (target && phase === 'play' && method === 'learn') arrows.push({ from: target[0], to: target[1], color: theme.arrowLearn });
    if (target && (phase === 'fail' || phase === 'quizFail')) arrows.push({ from: target[0], to: target[1], color: theme.arrowFail });
    if (target && hint && (phase === 'play' || phase === 'quiz')) arrows.push({ from: target[0], color: theme.arrowHint });
  }

  const onlyMove =
    screenMode !== 'explore' &&
    target &&
    ((phase === 'play' && method === 'learn') || phase === 'fail' || phase === 'quizFail')
      ? target
      : null;
  const movable =
    screenMode === 'explore' || (!!ctx && !shown && ['play', 'fail', 'quiz', 'quizFail'].includes(phase));

  const comments = [view.comment, phase === 'play' && method === 'learn' ? ctx?.targetMove.data.comment : '']
    .filter(Boolean)
    .join('\n\n')
    .replace(/\|/g, '\n');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: `${screenMode === 'learn' ? 'Learn' : screenMode === 'explore' ? 'Tree' : 'Recall'} · ${chapter.name}`,
        }}
      />
      <Board
        fen={view.fen}
        orientation={chapter.trainAs}
        size={boardSize}
        lastMove={view.lastMove}
        arrows={arrows}
        marks={wrong && screenMode !== 'explore' ? wrong.map((s) => ({ square: s, color: theme.wrongSquare })) : undefined}
        movable={movable}
        onlyMove={onlyMove}
        onMove={onMove}
      />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 88 + insets.bottom }}>
        <Segmented<ScreenMode>
          value={screenMode}
          options={[
            { value: 'learn', label: `Learn (${chapter.unseenCount})` },
            { value: 'recall', label: `Recall (${chapter.lastDueCount})` },
            { value: 'explore', label: 'Tree / Edit' },
          ]}
          onChange={setScreenMode}
        />

        <OpeningBanner opening={detectedOpening} inBook={inBookNow} />

        {screenMode === 'explore' ? (
          <ExplorePanel
            chapterId={chapter.uuid}
            explorePath={explorePath}
            setExplorePath={setExplorePath}
            exploreNodes={exploreNodes}
            commentDraft={commentDraft}
            setCommentDraft={setCommentDraft}
            onSaveComment={() => setNodeComment(chapter.uuid, explorePath, commentDraft.trim())}
            onDeleteBranch={() => {
              if (!explorePath) return;
              Alert.alert('Delete variation?', 'Delete this move and all sub-variations following it?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    const parentPath = explorePath.slice(0, -2);
                    deleteTreeNode(chapter.uuid, explorePath);
                    setExplorePath(parentPath);
                  },
                },
              ]);
            }}
          />
        ) : (
          <>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ExplorePanel({
  explorePath,
  setExplorePath,
  exploreNodes,
  commentDraft,
  setCommentDraft,
  onSaveComment,
  onDeleteBranch,
}: {
  chapterId: string;
  explorePath: string;
  setExplorePath: (p: string) => void;
  exploreNodes: TrainableNode[];
  commentDraft: string;
  setCommentDraft: (c: string) => void;
  onSaveComment: () => void;
  onDeleteBranch: () => void;
}) {
  const current = exploreNodes[exploreNodes.length - 1];
  const firstChild = current?.children[0];

  return (
    <View style={{ gap: 10 }}>
      {/* Tree Nav Bar */}
      <View style={styles.row}>
        <Button
          small
          kind="secondary"
          title="|◀ Start"
          disabled={!explorePath}
          onPress={() => setExplorePath('')}
          style={{ flex: 1 }}
        />
        <Button
          small
          kind="secondary"
          title="◀ Back"
          disabled={!explorePath}
          onPress={() => setExplorePath(explorePath.slice(0, -2))}
          style={{ flex: 1 }}
        />
        <Button
          small
          kind="secondary"
          title="Next ▶"
          disabled={!firstChild}
          onPress={() => firstChild && setExplorePath(explorePath + firstChild.data.id)}
          style={{ flex: 1 }}
        />
        <Button
          small
          kind="danger"
          title="🗑"
          disabled={!explorePath}
          onPress={onDeleteBranch}
        />
      </View>

      {/* Current Line Breadcrumbs */}
      <Card style={{ gap: 8 }}>
        <Text style={styles.secTitle}>Line hiện tại (Chạm vào bàn cờ để thêm nhánh mới)</Text>
        <View style={styles.crumbWrap}>
          <Pressable
            onPress={() => setExplorePath('')}
            style={[styles.crumbChip, !explorePath && styles.crumbChipActive]}
          >
            <Text style={[styles.crumbText, !explorePath && { color: '#fff' }]}>Start</Text>
          </Pressable>
          {exploreNodes.slice(1).map((n, idx) => {
            const subPath = explorePath.slice(0, (idx + 1) * 2);
            const isCur = subPath === explorePath;
            const moveNo = Math.floor(idx / 2) + 1;
            const prefix = idx % 2 === 0 ? `${moveNo}.` : '';
            return (
              <Pressable
                key={subPath}
                onPress={() => setExplorePath(subPath)}
                style={[styles.crumbChip, isCur && styles.crumbChipActive]}
              >
                <Text style={[styles.crumbText, isCur && { color: '#fff' }]}>
                  {prefix}
                  {n.data.san}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Next Branches from Current Position */}
        {current && current.children.length > 0 && (
          <View style={{ gap: 4, marginTop: 4 }}>
            <Text style={styles.mutedSmall}>Các biến tiếp theo từ thế cờ này:</Text>
            <View style={styles.crumbWrap}>
              {current.children.map((ch) => (
                <Pressable
                  key={ch.data.id}
                  onPress={() => setExplorePath(explorePath + ch.data.id)}
                  style={styles.branchChip}
                >
                  <Text style={styles.branchText}>➔ {ch.data.san}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Card>

      {/* Comment Editor */}
      <Card style={{ gap: 8 }}>
        <Text style={styles.secTitle}>Ghi chú cho nước đi này</Text>
        <TextInput
          value={commentDraft}
          onChangeText={setCommentDraft}
          placeholder="Nhập giải thích ý tưởng khai cuộc tại thế cờ này…"
          multiline
          style={styles.commentInput}
        />
        <Button small title="💾 Lưu ghi chú" onPress={onSaveComment} />
      </Card>
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
  mutedSmall: { color: theme.muted, fontSize: 12 },
  progress: { color: theme.muted, fontSize: 13 },
  prompt: { fontSize: 16, fontWeight: '600', color: theme.text },
  feedback: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  comment: { color: theme.text, fontSize: 15, lineHeight: 21 },
  secTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
  crumbWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  crumbChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#e8edf5',
  },
  crumbChipActive: { backgroundColor: theme.primary },
  crumbText: { fontSize: 13, fontWeight: '700', color: theme.text },
  branchChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  branchText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  commentInput: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: theme.text,
    backgroundColor: '#f8fafc',
    textAlignVertical: 'top',
  },
});
