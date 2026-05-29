// Task #414 — Mobile booking-reminder ack screen.
// Deep-linked from the hour-out coaching push
// (data.url=/action/booking-reminder/<id>). POSTs to
// /api/bookings/:id/reminder-ack (new in this task).
import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActionShell, ActionState, PrimaryButton, actionErrorState } from '../../../components/ActionShell';
import { api } from '../../../lib/api';

export default function BookingReminderAck() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<ActionState>({ kind: 'idle' });

  const ack = async () => {
    setState({ kind: 'busy' });
    try {
      await api.ackBookingReminder(id!);
      setState({ kind: 'ok', message: 'Got it — your coach will see you\'re ready.' });
    } catch (err) {
      setState(actionErrorState(err));
    }
  };

  return (
    <ActionShell
      title="Coaching session in 1 hour"
      subtitle={`Booking #${id}. Tap to confirm you've seen the reminder.`}
      state={state}
    >
      <PrimaryButton label="Got it" onPress={ack} disabled={state.kind === 'busy' || state.kind === 'ok'} />
    </ActionShell>
  );
}
