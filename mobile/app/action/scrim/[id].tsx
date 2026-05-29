// Task #414 — Mobile scrim respond screen.
// Deep-linked from the scrim-proposed push (data.url=/action/scrim/<id>).
// POSTs to /api/scrims/:id/respond which is already session-authed.
import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActionShell, ActionState, PrimaryButton, actionErrorState } from '../../../components/ActionShell';
import { api } from '../../../lib/api';

export default function ScrimRespond() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const run = async (accept: boolean) => {
    setState({ kind: 'busy' });
    try {
      await api.respondScrim(id!, accept);
      setState({ kind: 'ok', message: accept ? 'Scrim accepted — see you on the day.' : 'Scrim declined.' });
    } catch (err) {
      setState(actionErrorState(err));
    }
  };

  return (
    <ActionShell
      title="Scrim request"
      subtitle={`Respond to scrim proposal #${id}.`}
      state={state}
    >
      <PrimaryButton label="Accept scrim" onPress={() => run(true)} disabled={state.kind === 'busy'} />
      <PrimaryButton label="Decline" tone="danger" onPress={() => run(false)} disabled={state.kind === 'busy'} />
    </ActionShell>
  );
}
