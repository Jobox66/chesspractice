import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from 'chessops';
import { Board, type Arrow, type BoardBadge } from '../components/Board';
import {
  AnalysisSummary,
  BoardPlayerBar,
  EvalGraph,
  JudgmentPill,
  OpeningBanner,
  VerticalEvalBar,
} from '../components/ChessWidgets';
import { Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';
import { squaresToUci, type Square } from '../core/chess';
import type { Color } from '../core/types';
import {
  accuracy,
  evalText,
  JUDGMENT_COLOR,
  JUDGMENT_SYMBOL,
  reviewMoves,
  type Analysis,
  type MoveReview,
  type PlyEval,
} from '../../../shared/analysis';
import { calculateMaterial, replay, resultText, toPgn, turnOf } from '../../../shared/game';
import { detectOpening, isPlyInBook } from '../../../shared/openings';
import { ELO_STEP, MAX_ELO, MIN_ELO, usePlayStore, useShown } from '../play/store';
import { useApp } from '../store/app';

type SubTab = 'moves' | 'setup' | 'games';

const ELO_PRESETS = [
  { label: 'Mới chơi', elo: 1000 },
  { label: 'Cơ bản', elo: 1300 },
  { label: 'Trung cấp', elo: 1600 },
  { label: 'Cao cấp', elo: 2000 },
  { label: 'Kiện tướng', elo: 2500 },
];

export default function PlayScreen() {
  const s = usePlayStore();
  const shown = useShown();
  const username = useApp((st) => st.user?.username ?? null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [subTab, setSubTab] = useState<SubTab>('moves');

  useEffect(() => {
    s.initEngine();
    void s.loadLibrary(username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const evalBarWidth = 24;
  const boardGap = 6;
  const sidePadding = 16;
  const boardSize = Math.floor((width - sidePadding - evalBarWidth - boardGap) / 8) * 8;

  const game = shown.game;
  const fens = shown.fens;
  const sans = shown.sans;
  const moves = game?.moves ?? [];
  const totalPly = moves.length;
  const curPly = s.viewPly ?? totalPly;
  const curFen = fens[curPly] ?? fens[0];
  const curTurn = turnOf(curFen);
  const userColor: Color = game?.playerColor ?? (s.settings.color === 'black' ? 'black' : 'white');

  // Synthesize live analysis from liveEvals during play when post-game analysis hasn't run yet
  const syntheticAnalysis = useMemo<Analysis | null>(() => {
    if (game?.analysis) return game.analysis;
    if (fens.length < 2) return null;
    const evals: PlyEval[] = [];
    const best: string[] = [];
    for (let i = 0; i < fens.length; i++) {
      evals.push(s.liveEvals[i] ?? { cp: null, mate: null });
      best.push(s.liveBest[i] ?? '');
    }
    return { v: 1, movetime: 150, evals, best };
  }, [game?.analysis, fens, s.liveEvals, s.liveBest]);

  const reviewed = useMemo<MoveReview[]>(() => {
    if (!syntheticAnalysis || moves.length === 0) return [];
    return reviewMoves(moves, fens, syntheticAnalysis, sans);
  }, [moves, fens, sans, syntheticAnalysis]);

  const currentReview = curPly > 0 ? reviewed[curPly - 1] : undefined;
  const currentEval = useMemo<PlyEval | undefined>(() => {
    if (game?.analysis?.evals[curPly]) return game.analysis.evals[curPly];
    const direct = s.liveEvals[curPly];
    if (direct && (direct.cp != null || direct.mate != null)) return direct;
    for (let i = curPly - 1; i >= 0; i--) {
      const prev = s.liveEvals[i];
      if (prev && (prev.cp != null || prev.mate != null)) return prev;
    }
    return { cp: 0, mate: null };
  }, [game?.analysis, s.liveEvals, curPly]);

  const sansUpToPly = useMemo(() => sans.slice(0, curPly), [sans, curPly]);
  const detectedOpening = useMemo(() => detectOpening(sansUpToPly), [sansUpToPly]);
  const inBookNow = useMemo(() => isPlyInBook(sans, curPly), [sans, curPly]);
  const material = useMemo(() => calculateMaterial(curFen), [curFen]);

  // Orientation: default to user's color, flipped toggles it
  const orientation: Color = s.flipped ? (userColor === 'white' ? 'black' : 'white') : userColor;
  const flippedFromWhite = orientation === 'black';
  const topColor: Color = orientation === 'white' ? 'black' : 'white';
  const bottomColor: Color = orientation;

  const lastMoveSquares = useMemo<[Square, Square] | null>(() => {
    if (curPly <= 0 || !moves[curPly - 1]) return null;
    const u = moves[curPly - 1];
    return [u.slice(0, 2), u.slice(2, 4)];
  }, [curPly, moves]);

  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (s.hint && s.hint.ply === curPly) {
      out.push({
        from: s.hint.uci.slice(0, 2),
        to: s.hint.uci.slice(2, 4),
        color: 'rgba(34, 197, 94, 0.85)',
      });
    }
    if (currentReview?.judgment) {
      const j = currentReview.judgment;
      const playedUci = moves[curPly - 1];
      if (playedUci && (j === 'inaccuracy' || j === 'mistake' || j === 'blunder')) {
        out.push({
          from: playedUci.slice(0, 2),
          to: playedUci.slice(2, 4),
          color: JUDGMENT_COLOR[j] + 'cc',
        });
        if (currentReview.best && currentReview.best !== playedUci) {
          out.push({
            from: currentReview.best.slice(0, 2),
            to: currentReview.best.slice(2, 4),
            color: 'rgba(34, 197, 94, 0.88)',
          });
        }
      } else if (playedUci && (j === 'brilliant' || j === 'best')) {
        out.push({
          from: playedUci.slice(0, 2),
          to: playedUci.slice(2, 4),
          color: JUDGMENT_COLOR[j] + 'aa',
        });
      }
    }
    return out;
  }, [s.hint, curPly, currentReview, moves]);

  const boardBadge = useMemo<BoardBadge | null>(() => {
    if (!currentReview?.judgment || !lastMoveSquares) return null;
    return {
      square: lastMoveSquares[1],
      judgment: currentReview.judgment,
    };
  }, [currentReview, lastMoveSquares]);

  const canMove =
    !!game &&
    !game.result &&
    !s.review &&
    s.viewPly == null &&
    s.engine !== 'thinking' &&
    curTurn === game.playerColor;

  const onBoardMove = (from: Square, to: Square, promotion?: Role) => {
    s.move(squaresToUci(from, to, promotion));
  };

  const pairs = useMemo(() => {
    const rows: {
      moveNo: number;
      white?: { ply: number; san: string; review?: MoveReview };
      black?: { ply: number; san: string; review?: MoveReview };
    }[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      rows.push({
        moveNo: i / 2 + 1,
        white: { ply: i + 1, san: sans[i], review: reviewed[i] },
        black: sans[i + 1] ? { ply: i + 2, san: sans[i + 1], review: reviewed[i + 1] } : undefined,
      });
    }
    return rows;
  }, [sans, reviewed]);

  const sharePgn = async () => {
    if (!game) return;
    try {
      await Share.share({ message: toPgn(game), title: 'Game PGN' });
    } catch {
      // ignore
    }
  };

  const activeEvals = game?.analysis?.evals ?? syntheticAnalysis?.evals ?? [];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Play vs Bot & Analysis' }} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 88 + insets.bottom,
          gap: 8,
        }}
      >
        {/* Top Player Bar */}
        <BoardPlayerBar
          color={topColor}
          isUser={userColor === topColor}
          elo={game?.elo ?? s.settings.elo}
          active={!!game && !game.result && curTurn === topColor}
          thinking={s.engine === 'thinking' && userColor !== topColor}
          captured={topColor === 'white' ? material.capturedByWhite : material.capturedByBlack}
          advantage={topColor === 'white' ? Math.max(0, material.diff) : Math.max(0, -material.diff)}
        />

        {/* Eval Bar + Chessboard Row */}
        <View style={[styles.boardRow, { gap: boardGap }]}>
          <VerticalEvalBar evalPoint={currentEval} flipped={flippedFromWhite} height={boardSize} width={evalBarWidth} />
          <View style={styles.boardFrame}>
            <Board
              fen={curFen}
              orientation={orientation}
              size={boardSize}
              lastMove={lastMoveSquares}
              arrows={arrows}
              badge={boardBadge}
              movable={canMove}
              onMove={onBoardMove}
            />
          </View>
        </View>

        {/* Bottom Player Bar */}
        <BoardPlayerBar
          color={bottomColor}
          isUser={userColor === bottomColor}
          elo={game?.elo ?? s.settings.elo}
          active={!!game && !game.result && curTurn === bottomColor}
          thinking={s.engine === 'thinking' && userColor !== bottomColor}
          captured={bottomColor === 'white' ? material.capturedByWhite : material.capturedByBlack}
          advantage={bottomColor === 'white' ? Math.max(0, material.diff) : Math.max(0, -material.diff)}
        />

        {/* Move Coaching / Judgment Feedback Strip */}
        {currentReview && sans[curPly - 1] && (
          <View
            style={[
              styles.coachingBar,
              currentReview.judgment && {
                borderLeftColor: JUDGMENT_COLOR[currentReview.judgment],
                borderLeftWidth: 4,
              },
            ]}
          >
            <View style={styles.coachingMain}>
              <Text style={styles.coachingMove}>
                {Math.ceil(currentReview.ply / 2)}
                {currentReview.mover === 'white' ? '. ' : '... '}
                {sans[curPly - 1]}
              </Text>
              {currentReview.judgment && <JudgmentPill judgment={currentReview.judgment} showLabel />}
              {currentEval && <Text style={styles.coachingEval}>{evalText(currentEval, 'white')}</Text>}
            </View>
            {currentReview.bestSan &&
              currentReview.bestSan !== sans[curPly - 1] &&
              (currentReview.judgment === 'inaccuracy' ||
                currentReview.judgment === 'mistake' ||
                currentReview.judgment === 'blunder') && (
                <Text style={styles.coachingBest}>
                  Nước tốt nhất là <Text style={{ fontWeight: '800', color: theme.success }}>{currentReview.bestSan}</Text> (mũi tên xanh)
                </Text>
              )}
          </View>
        )}

        {/* Opening Banner */}
        <OpeningBanner opening={detectedOpening} inBook={inBookNow} />

        {/* Navigation Controls */}
        <View style={styles.navBar}>
          <Pressable style={styles.navBtn} onPress={() => s.setViewPly(0)} disabled={curPly === 0}>
            <Text style={[styles.navBtnText, curPly === 0 && styles.navDisabled]}>|◀</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => s.setViewPly(curPly - 1)} disabled={curPly === 0}>
            <Text style={[styles.navBtnText, curPly === 0 && styles.navDisabled]}>◀</Text>
          </Pressable>
          <Text style={styles.navCounter}>
            {curPly} / {totalPly}
          </Text>
          <Pressable style={styles.navBtn} onPress={() => s.setViewPly(curPly + 1)} disabled={curPly >= totalPly}>
            <Text style={[styles.navBtnText, curPly >= totalPly && styles.navDisabled]}>▶</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => s.setViewPly(null)} disabled={curPly >= totalPly}>
            <Text style={[styles.navBtnText, curPly >= totalPly && styles.navDisabled]}>▶|</Text>
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => s.toggleFlip()}>
            <Text style={styles.navBtnText}>⇅ Flip</Text>
          </Pressable>
        </View>

        {/* Action Strip (Playing vs Ended vs Setup) */}
        {game && !game.result && !s.review && (
          <View style={styles.actionRow}>
            <Button
              small
              kind="secondary"
              title={s.hintLoading ? 'Thinking…' : s.hint ? `Hint: ${s.hint.san}` : '💡 Hint'}
              disabled={s.engine === 'thinking' || s.hintLoading}
              onPress={() => s.requestHint()}
              style={{ flex: 1 }}
            />
            <Button
              small
              kind="secondary"
              title="↶ Takeback"
              disabled={moves.length === 0 || s.engine === 'thinking'}
              onPress={() => s.takeback()}
              style={{ flex: 1 }}
            />
            <Button
              small
              kind="danger"
              title="🏳 Resign"
              disabled={moves.length === 0}
              onPress={() =>
                Alert.alert('Resign game?', 'Bạn muốn đầu hàng ván cờ này?', [
                  { text: 'Hủy', style: 'cancel' },
                  { text: 'Đầu hàng', style: 'destructive', onPress: () => s.resign() },
                ])
              }
              style={{ flex: 1 }}
            />
          </View>
        )}

        {game && game.result && (
          <Card style={{ gap: 10, borderColor: theme.primary, borderWidth: 1.5 }}>
            <View style={styles.resultRow}>
              <Text style={styles.resultTitle}>{resultText(game.result, game.playerColor)}</Text>
            </View>
            {s.analysing && s.analysing.id === game.id ? (
              <View style={styles.analysingBox}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={styles.analysingText}>
                  Đang phân tích ván đấu… {Math.round((s.analysing.done / Math.max(1, s.analysing.total)) * 100)}%
                </Text>
                <Pressable onPress={() => s.cancelAnalysis()} style={{ marginLeft: 'auto' }}>
                  <Text style={{ color: theme.danger, fontWeight: '700' }}>Hủy</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actionRow}>
                {!game.analysis && (
                  <Button
                    small
                    title="🔍 Phân tích sâu"
                    onPress={() => s.analyse()}
                    style={{ flex: 1 }}
                  />
                )}
                <Button
                  small
                  kind="secondary"
                  title="🔄 Ván mới"
                  onPress={() => s.newGame()}
                  style={{ flex: 1 }}
                />
                {s.review && (
                  <Button
                    small
                    kind="secondary"
                    title="Đóng Review"
                    onPress={() => s.closeReview()}
                    style={{ flex: 1 }}
                  />
                )}
              </View>
            )}
          </Card>
        )}

        {!game && (
          <Card style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Bắt đầu ván cờ mới</Text>
            <View style={styles.presetRow}>
              {ELO_PRESETS.map((p) => (
                <Pressable
                  key={p.elo}
                  onPress={() => s.updateSettings({ elo: p.elo })}
                  style={[styles.presetChip, s.settings.elo === p.elo && styles.presetChipActive]}
                >
                  <Text style={[styles.presetLabel, s.settings.elo === p.elo && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                  <Text style={[styles.presetElo, s.settings.elo === p.elo && styles.presetTextActive]}>
                    {p.elo}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Segmented<Color | 'random'>
              value={s.settings.color}
              options={[
                { value: 'white', label: '♔ Quân Trắng' },
                { value: 'random', label: '🎲 Ngẫu nhiên' },
                { value: 'black', label: '♚ Quân Đen' },
              ]}
              onChange={(c) => s.updateSettings({ color: c })}
            />
            <Button title={`▶️ Bắt đầu đấu với Bot (${s.settings.elo})`} onPress={() => s.newGame()} />
          </Card>
        )}

        {/* Sub-navigation Tabs */}
        <Segmented<SubTab>
          value={subTab}
          options={[
            { value: 'moves', label: `Biên bản (${moves.length})` },
            { value: 'setup', label: `Cấu hình (${s.settings.elo})` },
            { value: 'games', label: `Lịch sử (${s.history.length})` },
          ]}
          onChange={setSubTab}
        />

        {subTab === 'moves' && (
          <Card style={{ gap: 10, padding: 10 }}>
            {reviewed.length > 0 && <AnalysisSummary reviewed={reviewed} userColor={userColor} />}

            {activeEvals.length >= 2 && (
              <EvalGraph
                evals={activeEvals}
                reviewed={reviewed}
                ply={curPly}
                onSelect={(p) => s.setViewPly(p)}
                width={width - 40}
                height={80}
              />
            )}

            <View style={styles.movesHeader}>
              <Text style={styles.movesColNum}>#</Text>
              <View style={[styles.movesColPlayer, styles.movesColWhiteHdr]}>
                <View style={[styles.dotSmall, { backgroundColor: '#fff' }]} />
                <Text style={styles.movesHdrWhiteText}>WHITE</Text>
                <Text style={styles.movesHdrRole}>{userColor === 'white' ? 'YOU' : 'BOT'}</Text>
              </View>
              <View style={[styles.movesColPlayer, styles.movesColBlackHdr]}>
                <View style={[styles.dotSmall, { backgroundColor: '#1e293b' }]} />
                <Text style={styles.movesHdrBlackText}>BLACK</Text>
                <Text style={[styles.movesHdrRole, { color: '#cbd5e1' }]}>
                  {userColor === 'black' ? 'YOU' : 'BOT'}
                </Text>
              </View>
              {moves.length > 0 && (
                <Pressable onPress={() => void sharePgn()} style={styles.pgnBtn}>
                  <Text style={styles.pgnBtnText}>PGN</Text>
                </Pressable>
              )}
            </View>

            {pairs.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có nước đi nào. Hãy bấm Bắt đầu hoặc đi quân trên bàn cờ!</Text>
            ) : (
              <View style={{ gap: 4 }}>
                {pairs.map((row) => (
                  <View key={row.moveNo} style={styles.moveRow}>
                    <Text style={styles.moveNum}>{row.moveNo}.</Text>
                    <MoveCell
                      cell={row.white}
                      side="white"
                      selected={curPly === row.white?.ply}
                      onPress={() => row.white && s.setViewPly(row.white.ply)}
                    />
                    <MoveCell
                      cell={row.black}
                      side="black"
                      selected={curPly === row.black?.ply}
                      onPress={() => row.black && s.setViewPly(row.black.ply)}
                    />
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {subTab === 'setup' && (
          <Card style={{ gap: 12 }}>
            <Text style={styles.sectionTitle}>Tuỳ chỉnh Bot Stockfish</Text>
            <View style={styles.eloAdjustRow}>
              <Button
                small
                kind="secondary"
                title={`-${ELO_STEP}`}
                disabled={s.settings.elo <= MIN_ELO}
                onPress={() => s.updateSettings({ elo: Math.max(MIN_ELO, s.settings.elo - ELO_STEP) })}
              />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.eloBig}>{s.settings.elo}</Text>
                <Text style={styles.mutedSmall}>
                  Elo mục tiêu ({MIN_ELO} – {MAX_ELO})
                </Text>
              </View>
              <Button
                small
                kind="secondary"
                title={`+${ELO_STEP}`}
                disabled={s.settings.elo >= MAX_ELO}
                onPress={() => s.updateSettings({ elo: Math.min(MAX_ELO, s.settings.elo + ELO_STEP) })}
              />
            </View>
            <View style={styles.presetRow}>
              {ELO_PRESETS.map((p) => (
                <Pressable
                  key={p.elo}
                  onPress={() => s.updateSettings({ elo: p.elo })}
                  style={[styles.presetChip, s.settings.elo === p.elo && styles.presetChipActive]}
                >
                  <Text style={[styles.presetLabel, s.settings.elo === p.elo && styles.presetTextActive]}>
                    {p.label}
                  </Text>
                  <Text style={[styles.presetElo, s.settings.elo === p.elo && styles.presetTextActive]}>
                    {p.elo}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionTitle}>Chọn màu quân</Text>
            <Segmented<Color | 'random'>
              value={s.settings.color}
              options={[
                { value: 'white', label: '♔ Trắng' },
                { value: 'random', label: '🎲 Ngẫu nhiên' },
                { value: 'black', label: '♚ Đen' },
              ]}
              onChange={(c) => s.updateSettings({ color: c })}
            />
            <Button
              title="▶️ Ván mới với cấu hình này"
              onPress={() => {
                s.newGame();
                setSubTab('moves');
              }}
            />
          </Card>
        )}

        {subTab === 'games' && (
          <Card style={{ gap: 8 }}>
            <Text style={styles.sectionTitle}>Các ván cờ đã lưu ({s.history.length})</Text>
            {s.history.length === 0 ? (
              <Text style={styles.emptyText}>Chưa có ván đấu nào được lưu.</Text>
            ) : (
              s.history.map((g) => {
                const rep = replay(g.moves);
                const rev = g.analysis ? reviewMoves(g.moves, rep.fens, g.analysis, rep.sans) : [];
                const acc = g.analysis ? accuracy(rev, g.playerColor) : null;
                const won = g.result?.winner === g.playerColor;
                const draw = g.result && !g.result.winner;
                const det = detectOpening(rep.sans);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => {
                      s.openGame(g.id);
                      setSubTab('moves');
                    }}
                    style={[styles.savedRow, game?.id === g.id && styles.savedRowActive]}
                  >
                    <View
                      style={[
                        styles.resBadge,
                        { backgroundColor: draw ? '#64748b' : won ? theme.success : theme.danger },
                      ]}
                    >
                      <Text style={styles.resBadgeText}>{draw ? 'D' : won ? 'W' : 'L'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedTitle}>
                        vs Stockfish ({g.elo}) · {g.moves.length} ply
                        {acc !== null ? ` · ${acc}% acc` : ''}
                      </Text>
                      <Text style={styles.savedSub} numberOfLines={1}>
                        {det ? `${det.eco} ${det.name}` : g.result?.reason ?? 'playing'} ·{' '}
                        {new Date(g.endedAt ?? g.startedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => s.deleteGame(g.id)}
                      hitSlop={10}
                      style={{ paddingHorizontal: 6 }}
                    >
                      <Text style={{ color: theme.danger, fontWeight: '700' }}>✕</Text>
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function MoveCell({
  cell,
  side,
  selected,
  onPress,
}: {
  cell?: { ply: number; san: string; review?: MoveReview };
  side: Color;
  selected: boolean;
  onPress: () => void;
}) {
  if (!cell) return <View style={{ flex: 1 }} />;
  const isWhite = side === 'white';
  const j = cell.review?.judgment;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.moveCell,
        isWhite ? styles.moveCellWhite : styles.moveCellBlack,
        selected && styles.moveCellSelected,
      ]}
    >
      <View style={styles.moveCellLeft}>
        <Text
          style={[
            styles.moveSan,
            isWhite ? styles.moveSanWhite : styles.moveSanBlack,
            selected && { color: '#ffffff' },
          ]}
        >
          {cell.san}
        </Text>
        {j && (
          <View
            style={[
              styles.moveBadge,
              { backgroundColor: selected ? 'rgba(255,255,255,0.22)' : JUDGMENT_COLOR[j] + '26' },
            ]}
          >
            <Text style={[styles.moveBadgeText, { color: selected ? '#fff' : JUDGMENT_COLOR[j] }]}>
              {JUDGMENT_SYMBOL[j]}
            </Text>
          </View>
        )}
      </View>
      {cell.review?.evalAfter && (
        <Text
          style={[
            styles.moveEval,
            !isWhite && { color: '#94a3b8' },
            selected && { color: '#e2e8f0' },
          ]}
        >
          {cell.review.evalAfter}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardFrame: {
    borderRadius: 6,
    overflow: 'hidden',
    elevation: 2,
  },
  coachingBar: {
    backgroundColor: theme.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 3,
  },
  coachingMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coachingMove: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.text,
  },
  coachingEval: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: theme.muted,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coachingBest: {
    fontSize: 12,
    color: theme.muted,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  navDisabled: {
    opacity: 0.3,
  },
  navCounter: {
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.muted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.text,
  },
  analysingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  analysingText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: theme.primary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    flex: 1,
    minWidth: 58,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  presetChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  presetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.text,
  },
  presetElo: {
    fontSize: 11,
    color: theme.muted,
  },
  presetTextActive: {
    color: '#ffffff',
  },
  movesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  movesColNum: {
    width: 26,
    fontSize: 12,
    fontWeight: '700',
    color: theme.muted,
    textAlign: 'center',
  },
  movesColPlayer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  movesColWhiteHdr: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  movesColBlackHdr: {
    backgroundColor: '#1e2430',
  },
  dotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  movesHdrWhiteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  movesHdrBlackText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f8fafc',
  },
  movesHdrRole: {
    marginLeft: 'auto',
    fontSize: 9.5,
    fontWeight: '800',
    color: theme.primary,
  },
  pgnBtn: {
    backgroundColor: '#e0ecff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pgnBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.primary,
  },
  emptyText: {
    color: theme.muted,
    fontSize: 13.5,
    textAlign: 'center',
    paddingVertical: 14,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moveNum: {
    width: 26,
    fontSize: 12,
    fontWeight: '600',
    color: theme.muted,
    textAlign: 'center',
  },
  moveCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  moveCellWhite: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  moveCellBlack: {
    backgroundColor: '#262d3d',
    borderColor: '#334155',
  },
  moveCellSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  moveCellLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  moveSan: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  moveSanWhite: {
    color: '#0f172a',
  },
  moveSanBlack: {
    color: '#f8fafc',
  },
  moveBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  moveBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  moveEval: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748b',
  },
  eloAdjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eloBig: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.primary,
  },
  mutedSmall: {
    fontSize: 12,
    color: theme.muted,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#f8fafc',
  },
  savedRowActive: {
    borderColor: theme.primary,
    backgroundColor: '#eef5ff',
  },
  resBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  savedTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.text,
  },
  savedSub: {
    fontSize: 12,
    color: theme.muted,
  },
});
