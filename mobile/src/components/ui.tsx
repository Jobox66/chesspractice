// Small shared UI pieces.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { theme } from './theme';

type BtnProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  small?: boolean;
};

export function Button({ title, onPress, kind = 'primary', disabled, busy, style, small }: BtnProps) {
  const bg =
    kind === 'primary' ? theme.primary : kind === 'danger' ? theme.danger : kind === 'secondary' ? '#e8edf5' : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? theme.primaryText : theme.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({ text, color = theme.warn, action }: { text: string; color?: string; action?: ReactNode }) {
  return (
    <View style={[styles.banner, { borderLeftColor: color }]}>
      <Text style={styles.bannerText}>{text}</Text>
      {action}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, value === o.value && styles.segActive]}>
          <Text style={[styles.segText, value === o.value && { color: theme.primary, fontWeight: '700' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnText: { fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  banner: {
    backgroundColor: '#fff8e6',
    borderLeftWidth: 4,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  bannerText: { color: theme.text, fontSize: 14 },
  seg: { flexDirection: 'row', backgroundColor: '#e8edf5', borderRadius: 10, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segActive: { backgroundColor: '#fff' },
  segText: { color: theme.muted, fontSize: 14 },
});
