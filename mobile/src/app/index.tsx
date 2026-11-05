import { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../store/app';
import type { Chapter } from '../core/types';
import { Banner, Button, Card } from '../components/ui';
import { theme } from '../components/theme';

export default function Home() {
  const { repertoire, user, loading, error, connected, pending, refresh, recount, renameChapter, deleteChapter } = useApp();
  const insets = useSafeAreaInsets();
  const [renaming, setRenaming] = useState<Chapter | null>(null);
  const [newName, setNewName] = useState('');

  // due counts change with time: refresh them whenever we come back here
  useFocusEffect(
    useCallback(() => {
      recount();
    }, [recount]),
  );

  const totalDue = repertoire.reduce((n, c) => n + c.lastDueCount, 0);

  const openMenu = (c: Chapter) =>
    Alert.alert(c.name, undefined, [
      {
        text: 'Đổi tên',
        onPress: () => {
          setNewName(c.name);
          setRenaming(c);
        },
      },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Xoá chương?', `"${c.name}" và toàn bộ tiến độ luyện tập của chương sẽ bị xoá.`, [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Xoá', style: 'destructive', onPress: () => deleteChapter(c.uuid) },
          ]),
      },
      { text: 'Đóng', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/account')} hitSlop={10}>
              <Text style={styles.account}>{user ? user.username : 'Đăng nhập'}</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={repertoire}
        keyExtractor={(c) => c.uuid}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 90 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Text style={styles.status}>
              {user
                ? `Đồng bộ với tài khoản ${user.username} · ${connected ? 'đang kết nối' : 'mất kết nối'}${
                    pending ? ` · ${pending} thay đổi chờ gửi` : ''
                  }`
                : 'Chế độ offline: dữ liệu chỉ lưu trên máy này'}
            </Text>
            {error && (
              <Banner
                text={error}
                color={theme.danger}
                action={<Button small kind="secondary" title="Thử lại" onPress={() => void refresh()} />}
              />
            )}
            {totalDue > 0 && <Text style={styles.dueTotal}>{totalDue} nước cần ôn hôm nay</Text>}
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <Card>
              <Text style={styles.empty}>Chưa có chương nào. Bấm “Thêm chương” để bắt đầu.</Text>
            </Card>
          )
        }
        renderItem={({ item: c }) => (
          <Pressable onLongPress={() => openMenu(c)} delayLongPress={350}>
            <Card>
              <View style={styles.row}>
                <View style={[styles.side, c.trainAs === 'white' ? styles.sideWhite : styles.sideBlack]} />
                <Text style={styles.name} numberOfLines={2}>
                  {c.name}
                </Text>
                <Pressable onPress={() => openMenu(c)} hitSlop={10}>
                  <Text style={styles.more}>⋮</Text>
                </Pressable>
              </View>
              <Text style={styles.counts}>
                <Text style={c.lastDueCount ? styles.due : undefined}>{c.lastDueCount} cần ôn</Text>
                {`  ·  ${c.unseenCount} chưa học  ·  ${c.enabledCount} nước`}
              </Text>
              <View style={styles.actions}>
                <Button
                  small
                  kind="secondary"
                  title="Học mới"
                  disabled={!c.unseenCount}
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/train/[id]', params: { id: c.uuid, mode: 'learn' } })}
                />
                <Button
                  small
                  title="Ôn tập"
                  disabled={!c.lastDueCount}
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/train/[id]', params: { id: c.uuid, mode: 'recall' } })}
                />
              </View>
            </Card>
          </Pressable>
        )}
      />
      <View style={[styles.fab, { bottom: 16 + insets.bottom }]}>
        <Button title="+ Thêm chương" onPress={() => router.push('/add')} />
      </View>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.modalBg}>
          <Card style={{ width: '86%', gap: 12 }}>
            <Text style={styles.modalTitle}>Đổi tên chương</Text>
            <TextInput value={newName} onChangeText={setNewName} style={styles.input} autoFocus maxLength={100} />
            <View style={styles.actions}>
              <Button kind="secondary" title="Huỷ" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
              <Button
                title="Lưu"
                style={{ flex: 1 }}
                disabled={!newName.trim()}
                onPress={() => {
                  if (renaming) renameChapter(renaming.uuid, newName.trim());
                  setRenaming(null);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  account: { color: theme.primary, fontWeight: '600', fontSize: 15 },
  status: { color: theme.muted, fontSize: 13 },
  dueTotal: { fontSize: 16, fontWeight: '700', color: theme.text },
  empty: { color: theme.muted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  side: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: '#555' },
  sideWhite: { backgroundColor: '#fff' },
  sideBlack: { backgroundColor: '#222' },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.text },
  more: { fontSize: 22, color: theme.muted, paddingHorizontal: 4 },
  counts: { color: theme.muted, marginTop: 6, fontSize: 13 },
  due: { color: theme.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  fab: { position: 'absolute', left: 16, right: 16 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.text,
    backgroundColor: '#fff',
  },
});
