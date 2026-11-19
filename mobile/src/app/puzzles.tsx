import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Role } from 'chessops';
import { Board, type Arrow } from '../components/Board';
import { RatingSparkline } from '../components/ChessWidgets';
import { Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';
import { squaresToUci, type Square } from '../core/chess';
import type { Color } from '../core/types';
import { sanOf, fenAfter, turnOf } from '../../../shared/game';
import { ratingSeries, themeCounts, todayStats, weakThemes } from '../puzzles/stats';
import { duePuzzles, type Difficulty, usePuzzleStore } from '../puzzles/store';
import { THEME_GROUPS, themeLabel } from '../puzzles/themes';
import { useApp } from '../store/app';

export default function PuzzlesScreen() {
  const s = usePuzzleStore();
  const username = useApp((st) => st.user?.username ?? null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const boardSize = Math.floor(width / 8) * 8;
  const [themeModal, setThemeModal] = useState(false);

  useEffect(() => {
    void (async () => {
      await s.loadSet();
      await s.loadProgress(username);
      if (!usePuzzleStore.getState().run) {
        usePuzzleStore.getState().next();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const run = s.run;
  const puzzle = run?.puzzle ?? null;

  // Player's side is the opposite of the side to move in puzzle.fen (since move[0] is opponent's setup move)
  const playerSide = useMemo<Color>(() => {
    if (!puzzle) return 'white';
    return turnOf(puzzle.fen) === 'white' ? 'black' : 'white';
  }, [puzzle]);

  const solutionSan = useMemo(() => {
    if (!puzzle) return [];
    const out: string[] = [];
    let fen = puzzle.fen;
    for (let i = 0; i < puzzle.moves.length; i++) {
      const uci = puzzle.moves[i];
      try {
        const san = sanOf(fen, uci);
        if (i >= 1) out.push(san);
        fen = fenAfter(fen, uci);
      } catch {
        break;
      }
    }
    return out;
  }, [puzzle]);

  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (!run) return out;
    if (run.hint && run.phase === 'play') {
      out.push({ from: run.hint, color: theme.arrowHint });
    }
    if (run.phase === 'wrong' && run.puzzle.moves[run.step]) {
      const exp = run.puzzle.moves[run.step];
      out.push({
        from: exp.slice(0, 2),
        to: exp.slice(2, 4),
        color: theme.arrowFail,
      });
    }
    return out;
  }, [run]);

  const onMove = (from: Square, to: Square, promotion?: Role) => {
    s.move(squaresToUci(from, to, promotion));
  };

  const today = useMemo(() => todayStats(s.attempts), [s.attempts]);
  const series = useMemo(
    () => ratingSeries(s.attempts).map((p) => p.rating),
    [s.attempts],
  );
  const weak = useMemo(
    () => (s.set ? weakThemes(s.set, s.progress) : []),
    [s.set, s.progress],
  );
  const countsByTheme = useMemo(
    () => (s.set ? themeCounts(s.set) : new Map<string, number>()),
    [s.set],
  );
  const dueCount = useMemo(
    () => (s.set ? duePuzzles(s.set, s.progress, s.settings.theme).length : 0),
    [s.set, s.progress, s.settings.theme],
  );

  if (s.setStatus === 'loading' || s.progressStatus === 'loading') {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Tactical Puzzles' }} />
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.muted}>Đang tải kho 10.000 bài tập chiến thuật…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Tactical Puzzles' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 88 + insets.bottom, gap: 10 }}>
        {run ? (
          <Board
            fen={run.fen}
            orientation={playerSide}
            size={boardSize}
            lastMove={run.lastMove}
            arrows={arrows}
            movable={run.phase === 'play'}
            onMove={onMove}
          />
        ) : (
          <View style={{ padding: 14 }}>
            <Card style={{ gap: 10, alignItems: 'center', paddingVertical: 24 }}>
              <Text style={styles.statusTitle}>
                {s.empty === 'review'
                  ? '🎉 Bạn đã ôn hết các bài tập đến hạn!'
                  : 'Không tìm thấy bài tập phù hợp với bộ lọc hiện tại.'}
              </Text>
              <Button
                small
                title="Chuyển sang chế độ Tính điểm (Rated)"
                onPress={() => s.updateSettings({ mode: 'rated', theme: null })}
              />
            </Card>
          </View>
        )}

        <View style={{ paddingHorizontal: 12, gap: 10 }}>
          {/* Status Banner */}
          {run && (
            <View
              style={[
                styles.statusBox,
                run.phase === 'done' && run.solved && styles.statusSolved,
                (run.phase === 'wrong' || (run.phase === 'done' && !run.solved)) && styles.statusWrong,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {(run.phase === 'intro' || run.phase === 'opponent') && 'Đối thủ đang đi…'}
                  {run.phase === 'play' &&
                    `Lượt của bạn: tìm nước tốt nhất cho ${playerSide === 'white' ? 'Trắng' : 'Đen'}`}
                  {run.phase === 'wrong' && `Chưa đúng (${run.wrongSan})! Hãy thử lại.`}
                  {run.phase === 'solution' && 'Đang trình diễn lời giải…'}
                  {run.phase === 'done' &&
                    (run.solved
                      ? '✓ Chính xác! Bạn đã giải xong bài tập.'
                      : 'Đã xem lời giải.')}
                </Text>
                {puzzle && (
                  <Text style={styles.statusSub}>
                    Puzzle #{puzzle.id} · Rating {puzzle.rating} ·{' '}
                    {run.kind === 'rated' ? 'Rated' : run.kind === 'review' ? 'Review' : 'Practice'}
                  </Text>
                )}
              </View>
              {run.ratingDelta !== null && (
                <Text
                  style={[
                    styles.deltaBadge,
                    { color: run.ratingDelta >= 0 ? theme.success : theme.danger },
                  ]}
                >
                  {run.ratingDelta >= 0 ? `+${run.ratingDelta}` : run.ratingDelta}
                </Text>
              )}
            </View>
          )}

          {/* Action Buttons */}
          {run && (
            <View style={styles.row}>
              {run.phase === 'play' && (
                <>
                  <Button
                    small
                    kind="secondary"
                    title={run.hint ? 'Đã gợi ý ô đi' : '💡 Gợi ý'}
                    disabled={!!run.hint}
                    onPress={() => s.hint()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    small
                    kind="danger"
                    title="🏳 Xem đáp án"
                    onPress={() => s.showSolution()}
                    style={{ flex: 1 }}
                  />
                </>
              )}
              {run.phase === 'done' && (
                <>
                  <Button
                    small
                    kind="secondary"
                    title="↺ Giải lại"
                    onPress={() => s.retry()}
                    style={{ flex: 1 }}
                  />
                  <Button
                    small
                    title="Bài tiếp theo ➔"
                    onPress={() => s.next()}
                    style={{ flex: 1 }}
                  />
                </>
              )}
            </View>
          )}

          {/* Solution & Themes */}
          {run && run.phase === 'done' && puzzle && (
            <Card style={{ gap: 6 }}>
              <Text style={styles.sectionLabel}>Lời giải: {solutionSan.join(' ')}</Text>
              <View style={styles.tagWrap}>
                {puzzle.themes.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => s.updateSettings({ theme: t })}
                    style={[styles.themeChip, s.settings.theme === t && styles.themeChipActive]}
                  >
                    <Text style={[styles.themeChipText, s.settings.theme === t && { color: '#fff' }]}>
                      {themeLabel(t)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Card>
          )}

          {/* Rating & Sparkline Card */}
          <Card style={{ gap: 8 }}>
            <View style={styles.ratingRow}>
              <View>
                <Text style={styles.mutedSmall}>RATING CHIẾN THUẬT</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={styles.ratingBig}>{Math.round(s.rating.rating)}</Text>
                  <Text style={styles.mutedSmall}>±{Math.round(s.rating.rd)}</Text>
                </View>
              </View>
              <View style={styles.todayStatsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>
                    {today.solved}/{today.solved + today.failed}
                  </Text>
                  <Text style={styles.statLbl}>Hôm nay</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>{today.minutes}m</Text>
                  <Text style={styles.statLbl}>Thời gian</Text>
                </View>
              </View>
            </View>
            {series.length >= 2 && <RatingSparkline values={series} width={width - 56} height={52} />}
          </Card>

          {/* Mode, Difficulty & Theme Filter */}
          <Card style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Chế độ & Bộ lọc</Text>
            <Segmented<'rated' | 'review'>
              value={s.settings.mode}
              options={[
                { value: 'rated', label: '⚡ Tính điểm (Rated)' },
                { value: 'review', label: `🔁 Ôn bài sai (${dueCount})` },
              ]}
              onChange={(m) => s.updateSettings({ mode: m })}
            />
            <Segmented<'-1' | '0' | '1'>
              value={String(s.settings.difficulty) as '-1' | '0' | '1'}
              options={[
                { value: '-1', label: 'Dễ (-250)' },
                { value: '0', label: 'Chuẩn (0)' },
                { value: '1', label: 'Khó (+250)' },
              ]}
              onChange={(d) => s.updateSettings({ difficulty: Number(d) as Difficulty })}
            />
            <Pressable onPress={() => setThemeModal(true)} style={styles.themeSelector}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mutedSmall}>Chủ đề chiến thuật</Text>
                <Text style={styles.themeSelectedText}>
                  {s.settings.theme ? themeLabel(s.settings.theme) : 'Tất cả chủ đề (10.000 bài)'}
                </Text>
              </View>
              <Text style={{ color: theme.primary, fontWeight: '700' }}>Chọn ▾</Text>
            </Pressable>
          </Card>

          {/* Weak Themes */}
          {weak.length > 0 && (
            <Card style={{ gap: 8 }}>
              <Text style={styles.sectionTitle}>Chủ đề cần cải thiện</Text>
              {weak.map((w) => (
                <Pressable
                  key={w.theme}
                  onPress={() => s.updateSettings({ mode: 'rated', theme: w.theme })}
                  style={styles.weakRow}
                >
                  <Text style={styles.weakName}>{themeLabel(w.theme)}</Text>
                  <Text style={styles.weakRate}>
                    {Math.round(w.successRate * 100)}% ({w.attempts} bài)
                  </Text>
                </Pressable>
              ))}
            </Card>
          )}

          {/* Recent History */}
          {s.attempts.length > 0 && (
            <Card style={{ gap: 8 }}>
              <Text style={styles.sectionTitle}>Lịch sử gần đây</Text>
              <View style={styles.histChips}>
                {s.attempts
                  .slice(-16)
                  .reverse()
                  .map((a, i) => {
                    const p = s.set?.byId.get(a.itemId);
                    return (
                      <Pressable
                        key={`${a.itemId}-${i}`}
                        onPress={() => s.openPuzzle(a.itemId)}
                        style={[
                          styles.histChip,
                          { backgroundColor: a.success ? '#dcfce7' : '#fee2e2' },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '700',
                            color: a.success ? '#15803d' : '#b91c1c',
                          }}
                        >
                          {a.success ? '✓' : '✗'} {p?.rating ?? a.itemId}
                        </Text>
                      </Pressable>
                    );
                  })}
              </View>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Theme Picker Modal */}
      <Modal visible={themeModal} transparent animationType="slide" onRequestClose={() => setThemeModal(false)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.ratingRow}>
              <Text style={styles.sectionTitle}>Chọn chủ đề chiến thuật</Text>
              <Pressable onPress={() => setThemeModal(false)}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.primary }}>Đóng</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              <Pressable
                onPress={() => {
                  s.updateSettings({ theme: null });
                  setThemeModal(false);
                }}
                style={[styles.themeItem, s.settings.theme === null && styles.themeItemActive]}
              >
                <Text style={[styles.themeItemTitle, s.settings.theme === null && { color: theme.primary }]}>
                  Tất cả chủ đề
                </Text>
                <Text style={styles.mutedSmall}>{s.set?.puzzles.length ?? 10000}</Text>
              </Pressable>
              {THEME_GROUPS.map((group) => (
                <View key={group.label} style={{ gap: 4 }}>
                  <Text style={styles.groupHdr}>{group.label}</Text>
                  {group.themes.map(([key, label]) => {
                    const count = countsByTheme.get(key) ?? 0;
                    if (count === 0) return null;
                    const active = s.settings.theme === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          s.updateSettings({ theme: key });
                          setThemeModal(false);
                        }}
                        style={[styles.themeItem, active && styles.themeItemActive]}
                      >
                        <Text style={[styles.themeItemTitle, active && { color: theme.primary }]}>
                          {label}
                        </Text>
                        <Text style={styles.mutedSmall}>{count}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  muted: { color: theme.muted, fontSize: 14 },
  mutedSmall: { color: theme.muted, fontSize: 11.5 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 10,
  },
  statusSolved: {
    borderColor: theme.success,
    backgroundColor: '#f0fdf4',
  },
  statusWrong: {
    borderColor: theme.danger,
    backgroundColor: '#fef2f2',
  },
  statusTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: theme.text,
  },
  statusSub: {
    fontSize: 12,
    color: theme.muted,
    marginTop: 2,
  },
  deltaBadge: {
    fontSize: 18,
    fontWeight: '800',
  },
  row: { flexDirection: 'row', gap: 8 },
  sectionLabel: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  themeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#e8edf5',
  },
  themeChipActive: { backgroundColor: theme.primary },
  themeChipText: { fontSize: 12, fontWeight: '600', color: theme.text },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingBig: { fontSize: 28, fontWeight: '800', color: theme.primary },
  todayStatsRow: { flexDirection: 'row', gap: 14 },
  statBox: { alignItems: 'flex-end' },
  statVal: { fontSize: 16, fontWeight: '800', color: theme.text },
  statLbl: { fontSize: 11, color: theme.muted },
  themeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#f8fafc',
  },
  themeSelectedText: { fontSize: 14, fontWeight: '700', color: theme.text, marginTop: 2 },
  weakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  weakName: { fontSize: 13.5, fontWeight: '700', color: theme.text },
  weakRate: { fontSize: 12.5, fontWeight: '700', color: theme.danger },
  histChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  histChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '78%',
    gap: 10,
  },
  groupHdr: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.muted,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  themeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  themeItemActive: {
    backgroundColor: '#eef5ff',
  },
  themeItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
});
