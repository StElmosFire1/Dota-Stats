import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api, PendingAction, PendingActionKind } from '../lib/api';
import { getAccountId } from '../lib/session';

// Task #459 — Inbox. Lists every item currently awaiting the signed-in
// account's response (pending ready-checks, scrim/transfer proposals, open
// MVP-vote windows, and un-ack'd coaching reminders) in one screen, each row
// deep-linking to the matching /action/<kind>/<id> screen built in #414.
// Backed by the single GET /api/me/pending-actions aggregate so the screen is
// one fetch. Re-fetches on focus so the badge + list stay fresh after the user
// resolves an item and navigates back.

const KIND_META: Record<PendingActionKind, { label: string; icon: string }> = {
  'ready-check': { label: 'Ready check', icon: '🎮' },
  scrim: { label: 'Scrim', icon: '⚔️' },
  'roster-transfer': { label: 'Transfer', icon: '🔁' },
  'mvp-vote': { label: 'MVP vote', icon: '⭐' },
  'booking-reminder': { label: 'Coaching', icon: '🎓' },
};

export default function InboxScreen() {
  const router = useRouter();
  const [accountId, setAccount] = useState<string | null>(null);
  const [rows, setRows] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const a = await getAccountId();
      setAccount(a);
      if (!a) {
        setRows([]);
        return;
      }
      const r = await api.getPendingActions();
      setRows(Array.isArray(r?.actions) ? r.actions : []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Re-fetch whenever the screen regains focus (e.g. coming back from an
  // action screen after resolving an item) so the list doesn't show stale rows.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openAction = (item: PendingAction) => {
    router.push(`/action/${item.kind}/${item.id}` as any);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['bottom']} style={s.safe}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 32 }} />
      </SafeAreaView>
    );
  }

  if (!accountId) {
    return (
      <SafeAreaView edges={['bottom']} style={s.safe}>
        <View style={s.center}>
          <Text style={s.emptyTitle}>Sign in to see your inbox</Text>
          <Text style={s.emptyBody}>
            Pending ready-checks, scrim invites, transfer approvals, MVP votes,
            and coaching reminders all show up here once you sign in.
          </Text>
          <Pressable
            style={s.signIn}
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Steam"
          >
            <Text style={s.signInLabel}>Sign in with Steam</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={s.safe}>
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={rows.length ? s.list : s.listEmpty}
        refreshControl={
          <RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          error ? (
            <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Text style={s.emptyTitle}>You're all caught up</Text>
            <Text style={s.emptyBody}>
              Nothing is waiting on you right now. Pull down to refresh.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = KIND_META[item.kind] || { label: item.kind, icon: '•' };
          return (
            <Pressable
              style={({ pressed }) => [s.row, pressed && s.rowPressed]}
              onPress={() => openAction(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.subtitle || ''}`.trim()}
            >
              <View style={s.iconWrap}>
                <Text style={s.icon}>{meta.icon}</Text>
              </View>
              <View style={s.rowBody}>
                <View style={s.rowTop}>
                  <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.badge}>{meta.label}</Text>
                </View>
                {item.subtitle ? (
                  <Text style={s.rowSub} numberOfLines={2}>{item.subtitle}</Text>
                ) : null}
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  list: { padding: 12, gap: 10 },
  listEmpty: { flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 10 },
  emptyTitle: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: theme.textMuted, textAlign: 'center', lineHeight: 20 },
  error: { color: theme.loss, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  rowPressed: { opacity: 0.8 },
  iconWrap: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: theme.surfaceAlt,
    justifyContent: 'center', alignItems: 'center',
  },
  icon: { fontSize: 20 },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  badge: {
    color: theme.accent, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  rowSub: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  chevron: { color: theme.textMuted, fontSize: 22, fontWeight: '300' },
  signIn: {
    marginTop: 8, backgroundColor: theme.accent,
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20,
  },
  signInLabel: { color: theme.inkNavy, fontWeight: '800' },
});
