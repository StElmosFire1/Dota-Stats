// Task #414 — Mobile roster-transfer respond screen.
// Deep-linked from the transfer-proposed push
// (data.url=/action/roster-transfer/<id>). POSTs to
// /api/roster-transfers/:id/respond (already session-authed).
import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActionShell, ActionState, PrimaryButton } from '../../../components/ActionShell';
import { api } from '../../../lib/api';

export default function RosterTransferRespond() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const run = async (approve: boolean) => {
    setState({ kind: 'busy' });
    try {
      await api.respondRosterTransfer(id!, approve);
      setState({ kind: 'ok', message: approve ? 'Transfer approved.' : 'Transfer declined.' });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <ActionShell
      title="Roster transfer"
      subtitle={`Respond to roster transfer #${id}.`}
      state={state}
    >
      <PrimaryButton label="Approve" onPress={() => run(true)} disabled={state.kind === 'busy'} />
      <PrimaryButton label="Decline" tone="danger" onPress={() => run(false)} disabled={state.kind === 'busy'} />
    </ActionShell>
  );
}
