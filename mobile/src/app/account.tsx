import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../store/app';
import { exchangeIdToken } from '../services/api';
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from '../services/firebase';
import { Banner, Button, Card, Segmented } from '../components/ui';
import { theme } from '../components/theme';

export default function Account() {
  const { user, connected, pending, logout, signedIn } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
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
            {connected ? 'Đang đồng bộ với server.' : 'Chưa kết nối được server, sẽ tự thử lại.'}
            {pending ? ` ${pending} thay đổi đang chờ gửi.` : ''}
          </Text>
        </Card>
        <Button
          kind="danger"
          title="Đăng xuất"
          onPress={() =>
            Alert.alert(
              'Đăng xuất?',
              pending ? `Còn ${pending} thay đổi chưa gửi lên server, đăng xuất sẽ mất chúng.` : 'App sẽ quay về chế độ offline.',
              [
                { text: 'Huỷ', style: 'cancel' },
                {
                  text: 'Đăng xuất',
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
      setError('Tên người dùng này đã có người dùng.');
      return;
    }
    await signedIn(res.token, res.user, res.chapters);
    router.back();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (pendingToken) {
        await finish(pendingToken, username.trim().toLowerCase());
      } else {
        const addr = email.trim();
        const token = mode === 'login' ? await signInWithPassword(addr, password) : await signUpWithPassword(addr, password);
        await finish(token);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Nhập email trước, rồi bấm "Quên mật khẩu".');
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      Alert.alert('Đã gửi email', 'Kiểm tra hộp thư để đặt lại mật khẩu.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Đăng nhập cùng tài khoản với bản web để luyện chung một repertoire. Không đăng nhập thì app vẫn dùng được ở chế độ
          offline.
        </Text>

        {pendingToken ? (
          <Card style={{ gap: 10 }}>
            <Text style={styles.title}>Chọn tên người dùng</Text>
            <Text style={styles.muted}>3–20 ký tự: chữ thường, số, dấu gạch dưới.</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              placeholder="ten_cua_ban"
              maxLength={20}
            />
            <Button title="Tạo tài khoản" busy={busy} disabled={!/^[a-z0-9_]{3,20}$/.test(username.trim().toLowerCase())} onPress={() => void submit()} />
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'login', label: 'Đăng nhập' },
                { value: 'signup', label: 'Tạo tài khoản' },
              ]}
            />
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
              placeholder="Mật khẩu"
              secureTextEntry
              autoComplete="password"
              style={styles.input}
              onSubmitEditing={() => void submit()}
            />
            <Button
              title={mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              busy={busy}
              disabled={!email.trim() || !password}
              onPress={() => void submit()}
            />
            {mode === 'login' && <Button kind="ghost" small title="Quên mật khẩu / đặt mật khẩu" onPress={() => void forgot()} />}
          </Card>
        )}

        {error && <Banner text={error} color={theme.danger} />}

        <Text style={styles.note}>
          Tài khoản tạo bằng Google trên web: bấm “Quên mật khẩu / đặt mật khẩu” với email Google đó để đặt mật khẩu, rồi đăng
          nhập bằng email + mật khẩu.
        </Text>
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
