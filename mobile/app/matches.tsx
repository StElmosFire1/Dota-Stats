import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api } from '../lib/api';

const PAGE_SIZE = 25;

function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(value: string | number | Date): string {
  try {
    const d = new Date(value);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(value || '');
  }
}

// Paginated matches list per Task #381 spec — initial page + load-more
// (infinite scroll on end-reach) + pull-to-refresh that resets to page 1.
// Server enforces a hard cap of 100 per request (see `/api/matches`), so
// we page in chunks of 25 to keep the FlatList smooth on lower-end
// devices.
export default function MatchesScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number, replace: boolean) => {
    try {
      setError(null);
      const r = await api.getMatches(PAGE_SIZE, offset);
      const next = r.matches || [];
      setTotal(typeof r.total === 'number' ? r.total : null);
      setRows((prev) => replace ? next : [...prev, ...next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { loadPage(0, true); }, [loadPage]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPage(0, true);
  };

  const onEndReached = () => {
    if (loadingMore || refreshing || loading) return;
    if (total != null && rows.length >= total) return;
    setLoadingMore(true);
    loadPage(rows.length, false);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {error && <Text style={s.error}>{error}</Text>}
      <FlatList
        data={rows}
        keyExtractor={(m) => String(m.match_id)}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} />
            : (total != null && rows.length >= total
              ? <Text style={s.footer}>End of list ({total} match{total === 1 ? '' : 'es'}).</Text>
              : <View style={{ height: 24 }} />)
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/match/[id]', params: { id: String(item.match_id) } }} asChild>
            <Pressable
              style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={`Match ${item.match_id}, ${item.radiant_win ? 'Radiant win' : 'Dire win'}`}
            >
              <View style={s.cardHead}>
                <Text style={s.matchId}>#{item.match_id}</Text>
                <Text style={[s.winLabel, { color: item.radiant_win ? theme.win : theme.loss }]}>
                  {item.radiant_win ? 'Radiant Win' : 'Dire Win'}
                </Text>
              </View>
              <View style={s.cardRow}>
                <Text style={s.meta}>{fmtDate(item.date)}</Text>
                <Text style={s.meta}>{fmtDuration(item.duration)}</Text>
              </View>
              {item.lobby_name ? <Text style={s.lobby} numberOfLines={1}>{item.lobby_name}</Text> : null}
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  error: { color: theme.loss, padding: 12 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  matchId: { color: theme.gold, fontWeight: '700' },
  winLabel: { fontWeight: '700' },
  meta: { color: theme.textMuted, fontSize: 12 },
  lobby: { color: theme.text, marginTop: 6, fontSize: 13 },
  footer: { color: theme.textMuted, textAlign: 'center', paddingVertical: 16, fontSize: 12 },
});
