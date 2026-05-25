import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api } from '../lib/api';

export default function LeaderboardScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const r = await api.getLeaderboard(100);
      setRows(r.players || []);
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
        keyExtractor={(item, i) => String(item.account_id ?? item.player_id ?? i)}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListHeaderComponent={
          <View style={s.row}>
            <Text style={[s.cellRank, s.head]}>#</Text>
            <Text style={[s.cellName, s.head]}>Player</Text>
            <Text style={[s.cellRight, s.head]}>MMR</Text>
            <Text style={[s.cellRight, s.head]}>W-L</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[s.row, index % 2 === 1 && { backgroundColor: theme.surfaceAlt }]}>
            <Text style={s.cellRank}>{index + 1}</Text>
            <Text style={s.cellName} numberOfLines={1}>
              {item.display_name || item.persona_name || `id ${item.account_id || item.player_id}`}
            </Text>
            <Text style={s.cellRight}>{Math.round(item.mmr || 0)}</Text>
            <Text style={s.cellRight}>{(item.wins || 0)}-{(item.losses || 0)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  error: { color: theme.loss, padding: 12 },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center',
  },
  head: { fontWeight: '700', color: theme.gold, textTransform: 'uppercase', fontSize: 11 },
  cellRank: { width: 32, color: theme.textMuted },
  cellName: { flex: 1, color: theme.text },
  cellRight: { width: 64, textAlign: 'right', color: theme.text },
});
