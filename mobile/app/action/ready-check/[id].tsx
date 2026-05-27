// Task #414 — Mobile ready-check screen.
// Deep-linked from the lobby-imminent push (data.url=/action/ready-check/<id>).
// Hits POST /api/inhouse/:id/accept (or /decline) — both already accept
// the mobile session cookie via _resolveInhouseActor.
import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ActionShell, ActionState, PrimaryButton } from '../../../components/ActionShell';
import { api } from '../../../lib/api';
import { theme } from '../../../lib/theme';

export default function ReadyCheck() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const run = async (accept: boolean) => {
    setState({ kind: 'busy' });
    try {
      if (accept) await api.inhouseAccept(id!);
      else await api.inhouseDecline(id!);
      setState({ kind: 'ok', message: accept ? 'You\'re in — see you in the lobby.' : 'Declined.' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <ActionShell
      title="Lobby ready check"
      subtitle={`Session #${id} is in the accept phase. Confirm you're ready to play.`}
      state={state}
    >
      <PrimaryButton label="Accept" onPress={() => run(true)} disabled={state.kind === 'busy'} />
      <PrimaryButton label="Decline" tone="danger" onPress={() => run(false)} disabled={state.kind === 'busy'} />
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        Declining returns you to the queue and lets a stand-in fill the seat.
      </Text>
    </ActionShell>
  );
}
