// Shared chrome for the Task #414 action screens. Every deep-linked
// "confirm" screen looks the same — title, optional subtitle, one or two
// primary buttons, a result message, and a back-to-home secondary link.
// Pulling it out keeps the per-action files tiny and avoids drift in the
// keyboard-reachable button styling.
import React, { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { theme } from '../lib/theme';
import { QueuedError } from '../lib/offlineQueue';

export type ActionState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; message: string }
  | { kind: 'queued'; message: string }
  | { kind: 'error'; message: string };

// Task #460 — maps a thrown error into the right terminal state. A
// QueuedError means the network dropped mid-tap and the intent was saved
// for retry, so we show a calm "queued" affordance instead of a red error.
export function actionErrorState(err: unknown): ActionState {
  if (err instanceof QueuedError) {
    return { kind: 'queued', message: 'Queued — will retry when online.' };
  }
  return { kind: 'error', message: (err as Error)?.message || 'Request failed' };
}

// Disables a button once the action has reached a terminal-ish state.
export function isActionPending(state: ActionState): boolean {
  return state.kind === 'busy';
}

export function ActionShell({
  title,
  subtitle,
  state,
  children,
}: {
  title: string;
  subtitle?: string;
  state: ActionState;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <SafeAreaView edges={['bottom']} style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
          <View style={s.body}>{children}</View>
          {state.kind === 'busy' ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
          ) : null}
          {state.kind === 'ok' ? (
            <Text style={s.ok} accessibilityRole="text" accessibilityLiveRegion="polite">{state.message}</Text>
          ) : null}
          {state.kind === 'queued' ? (
            <Text style={s.queued} accessibilityRole="text" accessibilityLiveRegion="polite">{state.message}</Text>
          ) : null}
          {state.kind === 'error' ? (
            <Text style={s.error} accessibilityRole="text" accessibilityLiveRegion="polite">{state.message}</Text>
          ) : null}
        </View>
        <Pressable
          style={s.back}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text style={s.backLabel}>Back to home</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PrimaryButton({
  label, onPress, disabled, tone = 'primary',
}: { label: string; onPress: () => void; disabled?: boolean; tone?: 'primary' | 'danger' | 'secondary' }) {
  const bg = tone === 'danger' ? theme.loss : tone === 'secondary' ? theme.surfaceAlt : theme.accent;
  const fg = tone === 'secondary' ? theme.text : theme.inkNavy;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[s.btnLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 8,
  },
  title: { color: theme.gold, fontSize: 20, fontWeight: '800' },
  subtitle: { color: theme.textMuted, lineHeight: 20 },
  body: { marginTop: 12, gap: 12 },
  ok: { color: theme.win, fontWeight: '700', marginTop: 12 },
  queued: { color: theme.amber, fontWeight: '700', marginTop: 12 },
  error: { color: theme.loss, marginTop: 12 },
  btn: { borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  btnLabel: { fontWeight: '800' },
  back: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  backLabel: { color: theme.textMuted, textDecorationLine: 'underline' },
});
