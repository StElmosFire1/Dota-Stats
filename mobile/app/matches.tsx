import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api } from '../lib/api';

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

export default function MatchesScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await api.getMatches(50, 0);
      setRows(r.matches || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/match/[id]', params: { id: String(item.match_id) } }} asChild>
            <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
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
});
