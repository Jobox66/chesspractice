import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../store/app';
import { useServerWake } from '../services/api';
import { theme } from '../components/theme';

export default function RootLayout() {
  const ready = useApp((s) => s.ready);
  const bootstrap = useApp((s) => s.bootstrap);
  const waking = useServerWake((s) => s.waking);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.card },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Chess Practice' }} />
          <Stack.Screen name="train/[id]" options={{ title: '' }} />
          <Stack.Screen name="add" options={{ title: 'Add chapter' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
        </Stack>
      )}
      {waking && (
        <SafeAreaView edges={['bottom']} style={styles.wake}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.wakeText}>Waking the server (may take about a minute)…</Text>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
  wake: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
    backgroundColor: theme.warn,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  wakeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
