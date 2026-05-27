// Task #414 — Mobile coach booking screen.
// Deep-linked from the coach-availability or marketing push
// (data.url=/action/book-coach/<coachAccountId>?slot=ISO&kind=1to1|vod).
// 1:1 bookings POST to /api/coaches/:id/book; VOD reviews POST to
// /api/coaches/:id/vod-review. Both return either { url } (Stripe
// Checkout — opened in the in-app browser) or { booking_id, plan_redeemed }
// (one-tap plan redemption with no payment round-trip).
import React, { useState } from 'react';
import { Text, View, TextInput, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActionShell, ActionState, PrimaryButton } from '../../../components/ActionShell';
import { api } from '../../../lib/api';
import { theme } from '../../../lib/theme';

export default function BookCoach() {
  const { id, slot, kind } = useLocalSearchParams<{ id: string; slot?: string; kind?: string }>();
  const isVod = (kind || '').toLowerCase() === 'vod';
  const [state, setState] = useState<ActionState>({ kind: 'idle' });
  const [question, setQuestion] = useState('');
  const [matchId, setMatchId] = useState('');

  const run = async (usePlan: boolean) => {
    setState({ kind: 'busy' });
    try {
      const r = isVod
        ? await api.requestVodReview(id!, {
            question: question.trim(),
            match_id: matchId.trim() || undefined,
            use_plan: usePlan,
          })
        : await api.bookCoach(id!, {
            slot_start_at: slot || new Date(Date.now() + 60 * 60_000).toISOString(),
            duration_minutes: 60,
            use_plan: usePlan,
          });
      if (r?.url) {
        // Paid path — hand off to Stripe Checkout in the in-app browser.
        await WebBrowser.openBrowserAsync(r.url);
        setState({ kind: 'ok', message: 'Continue payment in the browser, then return to the app.' });
      } else if (r?.plan_redeemed) {
        setState({ kind: 'ok', message: isVod ? 'VOD review redeemed against your plan.' : 'Session booked against your plan.' });
      } else {
        setState({ kind: 'ok', message: 'Booking confirmed.' });
      }
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    }
  };

  return (
    <ActionShell
      title={isVod ? 'Request VOD review' : 'Book coaching session'}
      subtitle={isVod
        ? `Send a recorded match or replay link to coach #${id} with your question.`
        : `Book coach #${id}${slot ? ` for ${new Date(slot).toLocaleString()}` : ''}.`}
      state={state}
    >
      {isVod ? (
        <>
          <Text style={s.label}>Match ID (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 8123456789"
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            value={matchId}
            onChangeText={setMatchId}
            accessibilityLabel="Match ID for VOD review"
          />
          <Text style={s.label}>Question (10+ chars)</Text>
          <TextInput
            style={[s.input, s.textarea]}
            placeholder="What should the coach focus on?"
            placeholderTextColor={theme.textMuted}
            value={question}
            onChangeText={setQuestion}
            multiline
            accessibilityLabel="Question for the coach"
          />
        </>
      ) : null}
      <PrimaryButton
        label={isVod ? 'Submit VOD request' : 'Book & pay'}
        onPress={() => run(false)}
        disabled={state.kind === 'busy' || (isVod && question.trim().length < 10)}
      />
      <PrimaryButton
        label="Redeem from active plan"
        tone="secondary"
        onPress={() => run(true)}
        disabled={state.kind === 'busy' || (isVod && question.trim().length < 10)}
      />
      <Text style={{ color: theme.textMuted, fontSize: 12 }}>
        Plan redemption only works if you have an active monthly subscription with this coach.
      </Text>
    </ActionShell>
  );
}

const s = StyleSheet.create({
  label: { color: theme.textMuted, fontSize: 12, textTransform: 'uppercase' },
  input: {
    backgroundColor: theme.surfaceAlt,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    color: theme.text,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
});
