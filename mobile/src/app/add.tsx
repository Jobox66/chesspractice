import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OPENING_LIBRARY } from '../data/openingLibrary';
import { chapterFromPgn } from '../core/training';
import type { Color } from '../core/types';
import { useApp } from '../store/app';
import { Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';

type Tab = 'library' | 'pgn';

export default function Add() {
  const insets = useSafeAreaInsets();
  const repertoire = useApp((s) => s.repertoire);
  const addChapter = useApp((s) => s.addChapter);
  const [tab, setTab] = useState<Tab>('library');
  const [busy, setBusy] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [color, setColor] = useState<Color>('white');
  const [pgn, setPgn] = useState('');

  const add = async (rawPgn: string, trainAs: Color, chapterName: string, busyKey: string) => {
    let chapter;
    try {
      chapter = chapterFromPgn(rawPgn, trainAs, chapterName);
    } catch (e) {
      Alert.alert('Invalid PGN', e instanceof Error ? e.message : String(e));
      return;
    }
    setBusy(busyKey);
    try {
      await addChapter(chapter);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't add the chapter", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async () => {
    try {
      const res = await File.pickFileAsync();
      if (res.canceled) return;
      const file = res.result;
      const text = await file.text();
      setPgn(text);
      if (!name.trim()) setName(file.name.replace(/\.pgn$/i, ''));
    } catch (e) {
      Alert.alert("Couldn't open the file", e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 30 + insets.bottom }} keyboardShouldPersistTaps="handled">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'library', label: 'Opening library' },
          { value: 'pgn', label: 'Your PGN' },
        ]}
      />

      {tab === 'library' &&
        OPENING_LIBRARY.map((e) => {
          const exists = repertoire.some((c) => c.name === e.name);
          return (
            <Card key={e.id} style={{ gap: 6 }}>
              <Text style={styles.title}>{e.name}</Text>
              <Text style={styles.muted}>{e.description}</Text>
              <Button
                small
                kind={exists ? 'secondary' : 'primary'}
                title={exists ? 'In repertoire' : 'Add'}
                disabled={exists || !!busy}
                busy={busy === e.id}
                onPress={() => void add(e.pgn, e.trainAs, e.name, e.id)}
              />
            </Card>
          );
        })}

      {tab === 'pgn' && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.label}>Chapter name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="VD: Sicilian Najdorf" style={styles.input} maxLength={100} />
          <Text style={styles.label}>Train as</Text>
          <Segmented
            value={color}
            onChange={setColor}
            options={[
              { value: 'white', label: 'White' },
              { value: 'black', label: 'Black' },
            ]}
          />
          <View style={styles.row}>
            <Text style={[styles.label, { flex: 1 }]}>PGN</Text>
            <Button small kind="ghost" title="Paste" onPress={async () => setPgn(await Clipboard.getStringAsync())} />
            <Button small kind="ghost" title="Open .pgn file" onPress={() => void pickFile()} />
          </View>
          <TextInput
            value={pgn}
            onChangeText={setPgn}
            placeholder="1. e4 e5 2. Nf3 (2. Bc4) Nc6 ..."
            style={[styles.input, styles.pgn]}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
          />
          <Text style={styles.muted}>Only the first game in the PGN is imported. Variations (in parentheses) and comments {'{...}'} are kept.</Text>
          <Button
            title="Add chapter"
            disabled={!name.trim() || !pgn.trim() || !!busy}
            busy={busy === 'pgn'}
            onPress={() => void add(pgn, color, name.trim(), 'pgn')}
          />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700', color: theme.text },
  muted: { color: theme.muted, fontSize: 13 },
  label: { fontWeight: '600', color: theme.text },
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.text,
    backgroundColor: '#fff',
  },
  pgn: { minHeight: 160, fontFamily: 'monospace', fontSize: 13 },
});
