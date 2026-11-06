import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../store/app';
import { exchangeIdToken } from '../services/api';
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from '../services/firebase';
import { Banner, Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';

export default function Account() {
  const { user, connected, pending, logout, signedIn, signInWithKey } = useApp();
  const [mode, setMode] = useState<'key' | 'login' | 'signup'>('key');
  const [syncKey, setSyncKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  // ID token kept between "needs a username" and the second submit
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>{user.username}</Text>
          <Text style={styles.muted}>
            {connected ? 'Syncing with the server.' : "Can't reach the server, will retry."}
            {pending ? ` ${pending} change${pending === 1 ? '' : 's'} waiting to upload.` : ''}
          </Text>
        </Card>
        <Button
          kind="danger"
          title="Log out"
          onPress={() =>
            Alert.alert(
              'Log out?',
              `${
                pending
                  ? `${pending} change${pending === 1 ? ' has' : 's have'} not reached the server yet and will be lost.`
                  : 'The app goes back to offline mode.'
              } The sync key (if any) is removed from this device too; you will need to enter it again.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Log out',
                  style: 'destructive',
                  onPress: async () => {
                    await logout();
                    router.back();
                  },
                },
              ],
            )
          }
        />
      </ScrollView>
    );
  }

  const finish = async (idToken: string, name?: string) => {
    const res = await exchangeIdToken(idToken, name);
    if (res.kind === 'needsUsername') {
      setPendingToken(idToken);
      return;
    }
    if (res.kind === 'usernameTaken') {
      setError('That username is taken.');
      return;
    }
    await signedIn(res.token, res.user, res.chapters);
    router.back();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'key' && !pendingToken) {
        await signInWithKey(syncKey.trim());
        router.back();
      } else if (pendingToken) {
        await finish(pendingToken, username.trim().toLowerCase());
      } else {
        const addr = email.trim();
        const token =
          mode === 'login'
            ? await signInWithPassword(addr, password)
            : await signUpWithPassword(addr, password);
        await finish(token);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Enter your email first, then tap "Forgot password".');
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      Alert.alert('Email sent', 'Check your inbox to reset your password.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Log in with the same account as on the web to train one shared repertoire. Without an account the
          app works offline.
        </Text>

        {pendingToken ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Choose a username</Text>
            <Text style={styles.muted}>3–20 characters: lowercase letters, digits, underscore.</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="ten_cua_ban"
              maxLength={20}
            />
            <Button
              title="Create account"
              busy={busy}
              disabled={!/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())}
              onPress={() => void submit()}
            />
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'key', label: 'Sync key' },
                { value: 'login', label: 'Email' },
                { value: 'signup', label: 'Sign up' },
              ]}
            />
            {mode === 'key' ? (
              <>
                <TextInput
                  value={syncKey}
                  onChangeText={setSyncKey}
                  placeholder="Paste the sync key"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  onSubmitEditing={() => void submit()}
                />
                <Button
                  title="Log in"
                  busy={busy}
                  disabled={!syncKey.trim()}
                  onPress={() => void submit()}
                />
                <Text style={styles.note}>
                  The key is the SYNC_KEY value set on Render. Enter it once: the app remembers it until you
                  log out.
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  autoComplete="password"
                  style={styles.input}
                  onSubmitEditing={() => void submit()}
                />
                <Button
                  title={mode === 'login' ? 'Log in' : 'Create account'}
                  busy={busy}
                  disabled={!email.trim() || !password}
                  onPress={() => void submit()}
                />
                {mode === 'login' && (
                  <Button
                    kind="ghost"
                    small
                    title="Forgot / set password"
                    onPress={() => void forgot()}
                  />
                )}
              </>
            )}
          </Card>
        )}

        {error && <Banner text={error} color={theme.danger} />}

        {mode !== 'key' && (
          <Text style={styles.note}>
            Signed up with Google on the web? Tap “Forgot / set password” with that Google email to set a
            password, then log in with email + password.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 14, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: theme.text },
  muted: { color: theme.muted, fontSize: 14 },
  note: { color: theme.muted, fontSize: 12 },
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
