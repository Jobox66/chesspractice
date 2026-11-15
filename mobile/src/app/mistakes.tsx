import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from 'chessops';
import { Board, type Arrow, type BoardBadge } from '../components/Board';
import { JudgmentPill } from '../components/ChessWidgets';
import { Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';
import { squaresToUci, type Square } from '../core/chess';
import { collectMistakes, unanalysedGames } from '../mistakes/items';
import { isDue, useMistakeStore } from '../mistakes/store';
import { JUDGMENT_COLOR } from '../play/analysis';
import { usePlayStore } from '../play/store';
import { useApp } from '../store/app';

export default function MistakesScreen() {
  const m = useMistakeStore();
  const playStore = usePlayStore();
  const username = useApp((st) => st.user?.username ?? null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const boardSize = Math.floor(width / 8) * 8;
  const [filter, setFilter] = useState<'due' | 'all'>('due');

  useEffect(() => {
    void (async () => {
      playStore.initEngine();
      await playStore.loadLibrary(username);
      await m.loadProgress(username);
      if (!useMistakeStore.getState().run) {
        useMistakeStore.getState().next();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const allItems = useMemo(() => collectMistakes(playStore.history), [playStore.history]);
  const unanalysedCount = useMemo(
    () => unanalysedGames(playStore.history).length,
    [playStore.history],
  );

  const dueOrNewItems = useMemo(
    () => allItems.filter((it) => !m.progress[it.id] || isDue(m.progress[it.id])),
    [allItems, m.progress],
  );

  const visibleItems = filter === 'due' ? dueOrNewItems : allItems;
  const run = m.run;
  const currentItem = run?.item ?? null;

  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (!run) return out;
    const { item } = run;
    if (run.phase === 'play') {
      out.push({
        from: item.played.slice(0, 2),
        to: item.played.slice(2, 4),
        color: JUDGMENT_COLOR[item.judgment] + '88',
      });
      if (run.hinted) {
        out.push({
          from: item.best.slice(0, 2),
          color: theme.arrowHint,
        });
      }
    } else if (run.phase === 'done') {
      out.push({
        from: item.best.slice(0, 2),
        to: item.best.slice(2, 4),
        color: 'rgba(34, 197, 94, 0.9)',
      });
      if (run.tried && run.tried !== item.best) {
        out.push({
          from: run.tried.slice(0, 2),
          to: run.tried.slice(2, 4),
          color: 'rgba(239, 68, 68, 0.85)',
        });
      }
    }
    return out;
  }, [run]);

  const badge = useMemo<BoardBadge | null>(() => {
    if (!run || run.phase !== 'done') return null;
    if (run.outcome?.ok) {
      return { square: (run.tried ?? run.item.best).slice(2, 4), judgment: 'best' };
    }
    if (run.tried) {
      return { square: run.tried.slice(2, 4), judgment: 'mistake' };
    }
    return { square: run.item.best.slice(2, 4), judgment: 'best' };
  }, [run]);

  const onBoardMove = (from: Square, to: Square, promotion?: Role) => {
    m.move(squaresToUci(from, to, promotion));
  };

  const openSourceGame = () => {
    if (!currentItem) return;
    playStore.openGame(currentItem.gameId);
    playStore.setViewPly(currentItem.ply);
    router.push('/play');
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Sửa sai lầm (Mistakes)' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 88 + insets.bottom, gap: 10 }}>
        {run && currentItem ? (
          <>
            <Board
              fen={run.fen}
              orientation={currentItem.color}
              size={boardSize}
              lastMove={run.lastMove}
              arrows={arrows}
              badge={badge}
              movable={run.phase === 'play'}
              onMove={onBoardMove}
            />
            <View style={{ paddingHorizontal: 12, gap: 10 }}>
              <Card style={{ gap: 8 }}>
                <View style={styles.rowBetween}>
                  <View style={styles.rowGap}>
                    <JudgmentPill judgment={currentItem.judgment} showLabel />
                    <Text style={styles.itemMeta}>
                      Nước {currentItem.moveLabel} · vs Stockfish ({currentItem.opponentElo})
                    </Text>
                  </View>
                  <Pressable onPress={openSourceGame}>
                    <Text style={styles.linkText}>Mở ván cờ ↗</Text>
                  </Pressable>
                </View>

                {(run.phase === 'intro' || run.phase === 'play') && (
                  <Text style={styles.promptText}>
                    Trong ván đấu bạn đã đi{' '}
                    <Text style={{ color: JUDGMENT_COLOR[currentItem.judgment], fontWeight: '800' }}>
                      {currentItem.playedSan}
                    </Text>{' '}
                    ({currentItem.evalBeforeText} → {currentItem.evalAfterText}). Hãy tìm nước đi tốt hơn cho{' '}
                    {currentItem.color === 'white' ? 'Trắng' : 'Đen'}!
                  </Text>
                )}

                {run.phase === 'checking' && (
                  <View style={styles.rowGap}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={styles.promptText}>Engine đang chấm nước đi {run.triedSan}…</Text>
                  </View>
                )}

                {run.phase === 'done' && (
                  <View style={styles.compareGrid}>
                    <View style={styles.compareCol}>
                      <Text style={styles.compareLbl}>Trong ván</Text>
                      <Text style={[styles.compareSan, { color: JUDGMENT_COLOR[currentItem.judgment] }]}>
                        {currentItem.playedSan}
                      </Text>
                      <Text style={styles.compareEval}>{currentItem.evalAfterText}</Text>
                    </View>
                    {run.triedSan && (
                      <View style={styles.compareCol}>
                        <Text style={styles.compareLbl}>Bạn vừa đi</Text>
                        <Text
                          style={[
                            styles.compareSan,
                            { color: run.outcome?.ok ? theme.success : theme.danger },
                          ]}
                        >
                          {run.triedSan}
                        </Text>
                        {run.outcome?.eval && (
                          <Text style={styles.compareEval}>{run.outcome.eval}</Text>
                        )}
                      </View>
                    )}
                    <View style={styles.compareCol}>
                      <Text style={styles.compareLbl}>Tốt nhất</Text>
                      <Text style={[styles.compareSan, { color: theme.success }]}>
                        {currentItem.bestSan}
                      </Text>
                      <Text style={styles.compareEval}>{currentItem.evalBeforeText}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.rowGap}>
                  {run.phase === 'play' && (
                    <>
                      <Button
                        small
                        kind="secondary"
                        title={run.hinted ? 'Đã gợi ý' : '💡 Gợi ý'}
                        disabled={run.hinted}
                        onPress={() => m.hint()}
                        style={{ flex: 1 }}
                      />
                      <Button
                        small
                        kind="danger"
                        title="🏳 Xem đáp án"
                        onPress={() => m.showAnswer()}
                        style={{ flex: 1 }}
                      />
                    </>
                  )}
                  {run.phase === 'done' && (
                    <>
                      <Button
                        small
                        kind="secondary"
                        title="↺ Thử lại"
                        onPress={() => m.retry()}
                        style={{ flex: 1 }}
                      />
                      <Button
                        small
                        title="Bài tiếp ➔"
                        onPress={() => m.next()}
                        style={{ flex: 1 }}
                      />
                    </>
                  )}
                </View>
              </Card>
            </View>
          </>
        ) : (
          <View style={{ padding: 14 }}>
            <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
              <Text style={styles.emptyTitle}>
                {allItems.length === 0
                  ? 'Chưa có nước đi sai lầm nào được trích xuất'
                  : '🎉 Bạn đã ôn hết các sai lầm đến hạn!'}
              </Text>
              <Text style={styles.emptySub}>
                Hãy đấu với Bot ở mục Play và bấm "Phân tích sâu" sau ván cờ để hệ thống tự động gom các nước đi ? / ?? vào đây.
              </Text>
              <View style={styles.rowGap}>
                <Button small title="Sang trang Đấu với Bot" onPress={() => router.push('/play')} />
                {allItems.length > 0 && (
                  <Button
                    small
                    kind="secondary"
                    title="Luyện lại bài bất kỳ"
                    onPress={() => m.practice(allItems[0].id)}
                  />
                )}
              </View>
            </Card>
          </View>
        )}

        <View style={{ paddingHorizontal: 12, gap: 10 }}>
          {/* Batch Analyse Unanalysed Games */}
          {unanalysedCount > 0 && (
            <Card style={{ gap: 8 }}>
              <Text style={styles.sectionTitle}>
                Có {unanalysedCount} ván đấu chưa được phân tích
              </Text>
              {m.batch ? (
                <View style={styles.rowBetween}>
                  <View style={styles.rowGap}>
                    <ActivityIndicator size="small" color={theme.primary} />
                    <Text style={styles.itemMeta}>
                      Ván {m.batch.gamesDone + 1}/{m.batch.games} ({m.batch.positionsDone}/
                      {m.batch.positions} nước)…
                    </Text>
                  </View>
                  <Pressable onPress={() => m.cancelBatch()}>
                    <Text style={{ color: theme.danger, fontWeight: '700' }}>Hủy</Text>
                  </Pressable>
                </View>
              ) : (
                <Button
                  small
                  title={`🔍 Phân tích cả ${unanalysedCount} ván ngay`}
                  onPress={() => m.analyseAll()}
                />
              )}
            </Card>
          )}

          {/* Filter & Mistake List */}
          <Card style={{ gap: 10 }}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Danh sách lỗi ({visibleItems.length})</Text>
            </View>
            <Segmented<'due' | 'all'>
              value={filter}
              options={[
                {
                  value: 'due',
                  label: `Cần ôn (${dueOrNewItems.length})`,
                },
                { value: 'all', label: `Tất cả (${allItems.length})` },
              ]}
              onChange={setFilter}
            />

            {visibleItems.map((it) => {
              const prog = m.progress[it.id];
              const active = currentItem?.id === it.id;
              return (
                <Pressable
                  key={it.id}
                  onPress={() => m.practice(it.id)}
                  style={[styles.itemRow, active && styles.itemRowActive]}
                >
                  <JudgmentPill judgment={it.judgment} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemRowTitle}>
                      Nước {it.moveLabel} {it.playedSan} → Tốt nhất: {it.bestSan}
                    </Text>
                    <Text style={styles.itemMeta}>
                      vs Stockfish ({it.opponentElo}) · {it.evalBeforeText} → {it.evalAfterText}
                    </Text>
                  </View>
                  {prog?.lastSuccess && <Text style={styles.fixedBadge}>✓ Đã sửa</Text>}
                </Pressable>
              );
            })}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowGap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemMeta: {
    fontSize: 12,
    color: theme.muted,
  },
  linkText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: theme.primary,
  },
  promptText: {
    fontSize: 14,
    color: theme.text,
    lineHeight: 20,
  },
  compareGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  compareCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  compareLbl: {
    fontSize: 11,
    color: theme.muted,
    fontWeight: '600',
  },
  compareSan: {
    fontSize: 16,
    fontWeight: '800',
  },
  compareEval: {
    fontSize: 11.5,
    color: theme.muted,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: theme.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#f8fafc',
  },
  itemRowActive: {
    borderColor: theme.primary,
    backgroundColor: '#eef5ff',
  },
  itemRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.text,
  },
  fixedBadge: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.success,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
