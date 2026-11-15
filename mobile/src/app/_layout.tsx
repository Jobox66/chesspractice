import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../store/app';
import { useServerWake } from '../services/api';
import { theme } from '../components/theme';

const NAV_ITEMS = [
  { path: '/', label: 'Openings', icon: '📖' },
  { path: '/puzzles', label: 'Puzzles', icon: '🧩' },
  { path: '/play', label: 'Play & Review', icon: '⚔️' },
  { path: '/mistakes', label: 'Mistakes', icon: '🎯' },
] as const;

export default function RootLayout() {
  const ready = useApp((s) => s.ready);
  const bootstrap = useApp((s) => s.bootstrap);
  const waking = useServerWake((s) => s.waking);
  const pathname = usePathname();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const isActive = (target: string) => {
    if (target === '/') {
      return pathname === '/' || pathname.startsWith('/train') || pathname === '/add';
    }
    return pathname.startsWith(target);
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.card },
              headerTintColor: theme.text,
              contentStyle: { backgroundColor: theme.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" options={{ title: 'Openings Repertoire' }} />
            <Stack.Screen name="puzzles" options={{ title: 'Tactical Puzzles' }} />
            <Stack.Screen name="play" options={{ title: 'Play vs Bot & Analysis' }} />
            <Stack.Screen name="mistakes" options={{ title: 'Mistakes Trainer' }} />
            <Stack.Screen name="train/[id]" options={{ title: '' }} />
            <Stack.Screen name="add" options={{ title: 'Add chapter' }} />
            <Stack.Screen name="account" options={{ title: 'Account' }} />
          </Stack>

          <SafeAreaView edges={['bottom']} style={styles.tabBar}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.path);
              return (
                <Pressable
                  key={item.path}
                  onPress={() => {
                    if (!active || (item.path === '/' && pathname !== '/')) {
                      router.replace(item.path);
                    }
                  }}
                  style={[styles.tabItem, active && styles.tabItemActive]}
                >
                  <Text style={styles.tabIcon}>{item.icon}</Text>
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </SafeAreaView>
        </View>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: 6,
    paddingHorizontal: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 10,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: '#eef5ff',
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.muted,
  },
  tabLabelActive: {
    color: theme.primary,
    fontWeight: '800',
  },
  wake: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 58,
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
