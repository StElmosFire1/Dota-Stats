import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api } from '../lib/api';
import { getAccountId } from '../lib/session';

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<any | null>(null);
  const [accountId, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [s, a] = await Promise.all([api.getHomeStats().catch(() => null), getAccountId()]);
    setStats(s);
    setAccount(a);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView edges={['bottom']} style={s.safe}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={s.hero}>
          <Text style={s.heroTitle}>OCE Inhouse</Text>
          <Text style={s.heroSub}>Read-only companion · v0.1</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : (
          <View style={s.statsRow}>
            <StatTile label="Matches" value={stats?.total_matches ?? '—'} />
            <StatTile label="Players" value={stats?.total_players ?? '—'} />
            <StatTile label="Today" value={stats?.matches_today ?? '—'} />
          </View>
        )}

        <View style={s.nav}>
          <NavCard href="/leaderboard" title="Leaderboard" subtitle="Top inhouse MMR" />
          <NavCard href="/matches" title="Recent Matches" subtitle="Last 50 games" />
          <NavCard href="/settings" title="Settings" subtitle={accountId ? `Signed in as ${accountId}` : 'Sign in with Steam'} />
        </View>

        {!accountId && (
          <Pressable style={s.signIn} onPress={() => router.push('/sign-in')}>
            <Text style={s.signInLabel}>Sign in with Steam</Text>
          </Pressable>
        )}

        <Text style={s.footer}>
          The full inhouse lobby, captain draft, and Pro features remain on
          oceinhouse.gg. This app is a read-only companion for stats and push
          alerts.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: any }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{String(value)}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

function NavCard({ href, title, subtitle }: { href: any; title: string; subtitle: string }) {
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
        <Text style={s.cardTitle}>{title}</Text>
        <Text style={s.cardSub}>{subtitle}</Text>
      </Pressable>
    </Link>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  hero: { marginBottom: 16 },
  heroTitle: { color: theme.gold, fontSize: 28, fontWeight: '800' },
  heroSub: { color: theme.textMuted, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tile: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  tileValue: { color: theme.text, fontSize: 20, fontWeight: '700' },
  tileLabel: { color: theme.textMuted, marginTop: 4, fontSize: 12, textTransform: 'uppercase' },
  nav: { gap: 12, marginBottom: 24 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  cardSub: { color: theme.textMuted, marginTop: 4 },
  signIn: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  signInLabel: { color: theme.inkNavy, fontWeight: '800' },
  footer: { color: theme.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
