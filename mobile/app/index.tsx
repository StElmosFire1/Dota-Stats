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

// Task #381 Home screen — required surface per task spec:
//   "your profile, current rank/streak, last 5 matches" when signed in,
//   global stats + sign-in prompt when not. Pull-to-refresh re-fetches
//   everything.
export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState<any | null>(null);
  const [accountId, setAccount] = useState<string | null>(null);
  const [player, setPlayer] = useState<any | null>(null);
  const [streak, setStreak] = useState<any | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const a = await getAccountId();
    setAccount(a);
    if (a) {
      // Signed in — fetch profile, streak, and the last 5 matches in
      // parallel. Each .catch(() => …) is intentional: a partial outage
      // on one endpoint must not blank the whole screen.
      const [s, p, st, rm] = await Promise.all([
        api.getHomeStats().catch(() => null),
        api.getPlayer(a).catch(() => null),
        api.getPlayerStreak(a).catch(() => null),
        api.getPlayerRecentMatches(a, 5).catch(() => ({ matches: [] })),
      ]);
      setStats(s);
      setPlayer(p);
      setStreak(st);
      setRecent(rm?.matches || []);
    } else {
      const s = await api.getHomeStats().catch(() => null);
      setStats(s);
      setPlayer(null);
      setStreak(null);
      setRecent([]);
    }
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
        ) : accountId ? (
          <>
            <ProfileCard player={player} streak={streak} accountId={accountId} />
            <RecentMatchesCard matches={recent} />
            <View style={s.nav}>
              <NavCard href="/leaderboard" title="Leaderboard" subtitle="Top inhouse MMR" />
              <NavCard href="/matches" title="All Recent Matches" subtitle="Browse every game" />
              <NavCard href="/settings" title="Settings" subtitle={`Signed in as ${accountId}`} />
            </View>
          </>
        ) : (
          <>
            <View style={s.statsRow}>
              <StatTile label="Matches" value={stats?.total_matches ?? '—'} />
              <StatTile label="Players" value={stats?.total_players ?? '—'} />
              <StatTile label="Today" value={stats?.matches_today ?? '—'} />
            </View>
            <View style={s.nav}>
              <NavCard href="/leaderboard" title="Leaderboard" subtitle="Top inhouse MMR" />
              <NavCard href="/matches" title="Recent Matches" subtitle="Browse all games" />
              <NavCard href="/settings" title="Settings" subtitle="Sign in with Steam" />
            </View>
            <Pressable
              style={s.signIn}
              onPress={() => router.push('/sign-in')}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Steam"
            >
              <Text style={s.signInLabel}>Sign in with Steam</Text>
            </Pressable>
          </>
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

function ProfileCard({ player, streak, accountId }: { player: any; streak: any; accountId: string }) {
  // getPlayerStats returns a mix of shapes depending on whether the
  // account has seasonal data — defensively read every field.
  const name = player?.persona_name || player?.display_name || `Account ${accountId}`;
  const mmr = player?.mmr ?? player?.skill_mmr ?? null;
  const tier = player?.tier ?? player?.rank_tier ?? null;
  const wins = player?.wins ?? null;
  const losses = player?.losses ?? null;
  const wr = (wins != null && losses != null && (wins + losses) > 0)
    ? Math.round((wins / (wins + losses)) * 100) : null;
  // Streak shape from /players/:id/streak — { current, type } in most
  // builds, falls back to null.
  const streakCount = typeof streak === 'number' ? streak : (streak?.current ?? streak?.streak ?? null);
  const streakKind = streak?.type || (streakCount > 0 ? 'win' : streakCount < 0 ? 'loss' : null);
  const streakAbs = streakCount == null ? null : Math.abs(streakCount);
  const streakColor = streakKind === 'win' ? theme.win : streakKind === 'loss' ? theme.loss : theme.textMuted;
  return (
    <View style={s.profileCard}>
      <Text style={s.profileName} numberOfLines={1}>{name}</Text>
      <View style={s.profileRow}>
        <ProfileStat label="MMR" value={mmr != null ? String(mmr) : '—'} />
        <ProfileStat label="Rank" value={tier != null ? String(tier) : '—'} />
        <ProfileStat label="Win rate" value={wr != null ? `${wr}%` : '—'} />
        <ProfileStat
          label="Streak"
          value={streakAbs == null ? '—' : `${streakAbs}${streakKind ? streakKind[0].toUpperCase() : ''}`}
          color={streakColor}
        />
      </View>
    </View>
  );
}

function ProfileStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.profileStat}>
      <Text style={[s.profileStatValue, color ? { color } : null]}>{value}</Text>
      <Text style={s.profileStatLabel}>{label}</Text>
    </View>
  );
}

function RecentMatchesCard({ matches }: { matches: any[] }) {
  if (!matches.length) {
    return (
      <View style={s.recentCard}>
        <Text style={s.recentTitle}>Last 5 matches</Text>
        <Text style={s.recentEmpty}>No recent inhouse matches.</Text>
      </View>
    );
  }
  return (
    <View style={s.recentCard}>
      <Text style={s.recentTitle}>Last 5 matches</Text>
      {matches.map((m) => (
        <Link
          key={String(m.match_id)}
          href={{ pathname: '/match/[id]', params: { id: String(m.match_id) } }}
          asChild
        >
          <Pressable
            style={({ pressed }) => [s.recentRow, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Match ${m.match_id}, ${m.won ? 'win' : 'loss'}`}
          >
            <Text style={[s.recentResult, { color: m.won ? theme.win : theme.loss }]}>
              {m.won ? 'W' : 'L'}
            </Text>
            <Text style={s.recentHero} numberOfLines={1}>{m.hero || (m.hero_id ? `#${m.hero_id}` : '—')}</Text>
            <Text style={s.recentKda}>{`${m.kills ?? 0}/${m.deaths ?? 0}/${m.assists ?? 0}`}</Text>
            <Text style={s.recentMeta}>{m.gpm ? `${m.gpm} gpm` : ''}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
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
      <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={title}>
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
  profileCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  profileName: { color: theme.gold, fontSize: 18, fontWeight: '800', marginBottom: 10 },
  profileRow: { flexDirection: 'row', gap: 8 },
  profileStat: { flex: 1 },
  profileStatValue: { color: theme.text, fontSize: 18, fontWeight: '700' },
  profileStatLabel: { color: theme.textMuted, fontSize: 11, textTransform: 'uppercase', marginTop: 2 },
  recentCard: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  recentTitle: { color: theme.gold, fontWeight: '700', marginBottom: 8, fontSize: 14, textTransform: 'uppercase' },
  recentEmpty: { color: theme.textMuted, fontSize: 13 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    gap: 10,
  },
  recentResult: { width: 18, textAlign: 'center', fontWeight: '800' },
  recentHero: { flex: 1, color: theme.text, fontSize: 13 },
  recentKda: { color: theme.textMuted, fontSize: 13, width: 80, textAlign: 'right' },
  recentMeta: { color: theme.textMuted, fontSize: 12, width: 64, textAlign: 'right' },
});
