// Task #414 — Mobile MVP vote screen.
// Deep-linked from the post-match push (data.url=/action/mvp-vote/<matchId>).
// Lists the voter's teammates and submits to the new
// POST /api/matches/:id/mvp-vote endpoint added in this task.
import React, { useEffect, useState } from 'react';
import { Text, View, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ActionShell, ActionState, actionErrorState } from '../../../components/ActionShell';
import { api } from '../../../lib/api';
import { getAccountId } from '../../../lib/session';
import { theme } from '../../../lib/theme';

export default function MvpVote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });
  const [loading, setLoading] = useState(true);
  const [teammates, setTeammates] = useState<any[]>([]);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await getAccountId();
        const match = await api.getMatch(id!);
        const players: any[] = match?.players || [];
        const self = players.find((p: any) => String(p.account_id) === String(me));
        if (!self) {
          setState({ kind: 'error', message: 'You did not play in this match.' });
        } else {
          setTeammates(players.filter((p: any) =>
            p.team === self.team && String(p.account_id) !== String(me)
          ));
        }
      } catch (err) {
        setState({ kind: 'error', message: (err as Error).message });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const submit = async () => {
    if (!picked) return;
    setState({ kind: 'busy' });
    try {
      await api.castMvpVote(id!, picked);
      setState({ kind: 'ok', message: 'MVP vote recorded.' });
    } catch (err) {
      setState(actionErrorState(err));
    }
  };

  return (
    <ActionShell title="Vote MVP" subtitle={`Pick the best teammate from match #${id}.`} state={state}>
      {loading ? <ActivityIndicator color={theme.accent} /> : null}
      {!loading && teammates.map((p) => {
        const selected = picked === String(p.account_id);
        const name = p.nickname || p.persona_name || `Account ${p.account_id}`;
        const hero = p.hero_name ? p.hero_name.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ') : '';
        return (
          <Pressable
            key={String(p.account_id)}
            onPress={() => setPicked(String(p.account_id))}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${name}${hero ? ', ' + hero : ''}`}
            style={({ pressed }) => [
              s.row,
              selected && { borderColor: theme.accent, backgroundColor: theme.surfaceAlt },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[s.name, selected && { color: theme.gold }]} numberOfLines={1}>{name}</Text>
            <Text style={s.meta}>{`${hero} · ${p.kills || 0}/${p.deaths || 0}/${p.assists || 0}`}</Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={submit}
        disabled={!picked || state.kind === 'busy' || state.kind === 'ok'}
        accessibilityRole="button"
        accessibilityLabel="Submit MVP vote"
        accessibilityState={{ disabled: !picked }}
        style={({ pressed }) => [
          s.submit,
          { opacity: !picked || state.kind === 'busy' ? 0.5 : pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={s.submitLabel}>Submit vote</Text>
      </Pressable>
    </ActionShell>
  );
}

const s = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  name: { color: theme.text, fontWeight: '700' },
  meta: { color: theme.textMuted, fontSize: 12 },
  submit: {
    marginTop: 8,
    backgroundColor: theme.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  submitLabel: { color: theme.inkNavy, fontWeight: '800' },
});
