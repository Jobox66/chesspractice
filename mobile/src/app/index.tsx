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
        text: 'Rename',
        onPress: () => {
          setNewName(c.name);
          setRenaming(c);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete chapter?', `"${c.name}" and all its training progress will be deleted.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteChapter(c.uuid) },
          ]),
      },
      { text: 'Close', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/account')} hitSlop={10}>
              <Text style={styles.account}>{user ? user.username : 'Log in'}</Text>
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
                ? `Synced to ${user.username} · ${connected ? 'connected' : 'offline'}${
                    pending ? ` · ${pending} change${pending === 1 ? '' : 's'} pending` : ''
                  }`
                : 'Offline mode: data is stored on this device only'}
            </Text>
            {error && (
              <Banner
                text={error}
                color={theme.danger}
                action={<Button small kind="secondary" title="Retry" onPress={() => void refresh()} />}
              />
            )}
            {totalDue > 0 && <Text style={styles.dueTotal}>{totalDue} move{totalDue === 1 ? '' : 's'} due today</Text>}
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <Card>
              <Text style={styles.empty}>No chapters yet. Tap “Add chapter” to start.</Text>
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
                <Text style={c.lastDueCount ? styles.due : undefined}>{c.lastDueCount} due</Text>
                {`  ·  ${c.unseenCount} to learn  ·  ${c.enabledCount} moves`}
              </Text>
              <View style={styles.actions}>
                <Button
                  small
                  kind="secondary"
                  title="Learn"
                  disabled={!c.unseenCount}
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/train/[id]', params: { id: c.uuid, mode: 'learn' } })}
                />
                <Button
                  small
                  title="Recall"
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
        <Button title="+ Add chapter" onPress={() => router.push('/add')} />
      </View>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <View style={styles.modalBg}>
          <Card style={{ width: '86%', gap: 12 }}>
            <Text style={styles.modalTitle}>Rename chapter</Text>
            <TextInput value={newName} onChangeText={setNewName} style={styles.input} autoFocus maxLength={100} />
            <View style={styles.actions}>
              <Button kind="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
              <Button
                title="Save"
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
