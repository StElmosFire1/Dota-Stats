import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../lib/theme';
import { api } from '../../lib/api';

function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function MatchDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.getMatch(id);
        if (!cancelled) setMatch(r);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  if (error || !match) {
    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <Text style={s.error}>{error || 'Match not found.'}</Text>
      </SafeAreaView>
    );
  }

  const players: any[] = Array.isArray(match.players) ? match.players : [];
  const radiant = players.filter(p => p.team === 'radiant' || p.team === 0);
  const dire = players.filter(p => p.team === 'dire' || p.team === 1);

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Text style={s.title}>Match #{match.match_id}</Text>
        <View style={s.metaRow}>
          <Text style={s.meta}>{fmtDuration(match.duration)}</Text>
          <Text style={[s.winLabel, { color: match.radiant_win ? theme.win : theme.loss }]}>
            {match.radiant_win ? 'Radiant Win' : 'Dire Win'}
          </Text>
        </View>
        {match.lobby_name ? <Text style={s.lobby}>{match.lobby_name}</Text> : null}

        <TeamBlock label="Radiant" players={radiant} winner={!!match.radiant_win} />
        <TeamBlock label="Dire" players={dire} winner={!match.radiant_win} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TeamBlock({ label, players, winner }: { label: string; players: any[]; winner: boolean }) {
  return (
    <View style={s.team}>
      <Text style={[s.teamLabel, { color: winner ? theme.win : theme.loss }]}>
        {label} {winner ? '· Win' : '· Loss'}
      </Text>
      <View style={s.tableHead}>
        <Text style={[s.colName, s.headCell]}>Player</Text>
        <Text style={[s.colHero, s.headCell]}>Hero</Text>
        <Text style={[s.colNum, s.headCell]}>K</Text>
        <Text style={[s.colNum, s.headCell]}>D</Text>
        <Text style={[s.colNum, s.headCell]}>A</Text>
      </View>
      {players.map((p, i) => (
        <View key={p.id ?? i} style={[s.tableRow, i % 2 === 1 && { backgroundColor: theme.surfaceAlt }]}>
          <Text style={s.colName} numberOfLines={1}>{p.persona_name || `id ${p.account_id}`}</Text>
          <Text style={s.colHero} numberOfLines={1}>{p.hero_name || `#${p.hero_id}`}</Text>
          <Text style={s.colNum}>{p.kills ?? 0}</Text>
          <Text style={s.colNum}>{p.deaths ?? 0}</Text>
          <Text style={s.colNum}>{p.assists ?? 0}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  title: { color: theme.gold, fontWeight: '800', fontSize: 22 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 8 },
  meta: { color: theme.textMuted },
  winLabel: { fontWeight: '700' },
  lobby: { color: theme.text, marginBottom: 12 },
  team: {
    marginTop: 16,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  teamLabel: { fontWeight: '700', marginBottom: 8, fontSize: 14 },
  tableHead: { flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: theme.border },
  tableRow: { flexDirection: 'row', paddingVertical: 6, alignItems: 'center' },
  headCell: { color: theme.gold, fontWeight: '700', fontSize: 11, textTransform: 'uppercase' },
  colName: { flex: 1.4, color: theme.text },
  colHero: { flex: 1, color: theme.textMuted, fontSize: 12 },
  colNum: { width: 30, textAlign: 'center', color: theme.text },
  error: { color: theme.loss, padding: 16 },
});
