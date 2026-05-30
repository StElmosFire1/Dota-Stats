import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { api, setOnUnauthorized, startOfflineQueue } from '../lib/api';
import {
  clearSession, getAccountId, setAccountId, setSessionFromSetCookieHeader,
} from '../lib/session';
import { registerForPushNotificationsAsync } from '../lib/push';
import { parseDeepLink, resolvePushRoute } from '../lib/deepLink';
import { theme } from '../lib/theme';

export default function RootLayout() {
  const router = useRouter();
  // Task #414 — single, app-wide reauth modal. Triggered both by the api
  // 401 interceptor (cookie went stale on a write) and by a manual
  // "Sign in again" tap from the home/settings screens. We coalesce so a
  // burst of failing requests only shows the modal once.
  const [reauthOpen, setReauthOpen] = useState(false);
  const reauthOpenRef = useRef(false);
  const showReauth = () => {
    if (reauthOpenRef.current) return;
    reauthOpenRef.current = true;
    setReauthOpen(true);
  };
  const dismissReauth = () => {
    reauthOpenRef.current = false;
    setReauthOpen(false);
  };

  useEffect(() => {
    setOnUnauthorized(showReauth);
    return () => setOnUnauthorized(null);
  }, []);

  // Task #460 — start the offline write-action drainer. Replays any
  // network-dropped intents (ready-check accept, MVP vote, etc.) the moment
  // NetInfo reports connectivity restored or the app returns to foreground.
  useEffect(() => {
    const stop = startOfflineQueue();
    return () => stop();
  }, []);

  // Handle the `oceinhouse://?t=<token>` deep link that Steam OpenID lands
  // on after the in-app browser hand-off in app/sign-in.tsx. ALSO handles
  // Task #414 deep-link actions: oceinhouse:///action/<kind>/<id>?... —
  // mapped 1:1 to the Expo Router screens under app/action/. Push
  // notifications encode the same paths in their `data.url` payload so
  // tapping a push opens straight onto the right action screen.
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const decision = parseDeepLink(parsed);
        if (decision.kind === 'auth') {
          const { setCookie } = await api.authComplete(decision.token);
          if (setCookie) await setSessionFromSetCookieHeader(setCookie);
          try {
            const me = await api.authMe();
            if (me?.accountId) await setAccountId(me.accountId);
          } catch {}
          registerForPushNotificationsAsync().catch(() => {});
          dismissReauth();
          router.replace('/');
          return;
        }
        // Action deep link — `oceinhouse:///action/ready-check/123` parses
        // with `path = action/ready-check/123`. Forward into the router
        // verbatim so Expo Router picks up the matching dynamic segment.
        if (decision.kind === 'action') {
          router.push(decision.route as any);
        }
      } catch (err) {
        console.warn('[deep-link] handle failed:', (err as Error).message);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (ev) => handleUrl(ev.url));
    return () => sub.remove();
  }, [router]);

  // Push-tap → action screen. Expo `data.url` is shaped like
  // "/action/<kind>/<id>?…" by the server (see _fanOutExpoPush callsites
  // in src/web/server.js). When the user taps a push we route directly.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      try {
        const data: any = resp?.notification?.request?.content?.data || {};
        const route = resolvePushRoute(data);
        if (route) {
          router.push(route as any);
        }
      } catch (err) {
        console.warn('[push-tap] route failed:', (err as Error).message);
      }
    });
    return () => sub.remove();
  }, [router]);

  // If we already have a session cookie from a previous run, try to
  // register a fresh push token on cold start.
  useEffect(() => {
    (async () => {
      const accountId = await getAccountId();
      if (accountId) registerForPushNotificationsAsync().catch(() => {});
    })();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text, fontWeight: '700' },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'OCE Inhouse' }} />
        <Stack.Screen name="inbox" options={{ title: 'Inbox' }} />
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="matches" options={{ title: 'Recent Matches' }} />
        <Stack.Screen name="match/[id]" options={{ title: 'Match Detail' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="action/ready-check/[id]" options={{ title: 'Ready check' }} />
        <Stack.Screen name="action/mvp-vote/[id]" options={{ title: 'Vote MVP' }} />
        <Stack.Screen name="action/scrim/[id]" options={{ title: 'Scrim respond' }} />
        <Stack.Screen name="action/roster-transfer/[id]" options={{ title: 'Roster transfer' }} />
        <Stack.Screen name="action/book-coach/[id]" options={{ title: 'Book coach' }} />
        <Stack.Screen name="action/booking-reminder/[id]" options={{ title: 'Booking reminder' }} />
      </Stack>

      <ReauthModal
        visible={reauthOpen}
        onSignIn={async () => {
          await clearSession().catch(() => {});
          dismissReauth();
          router.push('/sign-in');
        }}
        onDismiss={dismissReauth}
      />
    </>
  );
}

function ReauthModal({
  visible, onSignIn, onDismiss,
}: { visible: boolean; onSignIn: () => void; onDismiss: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <View style={m.backdrop}>
        <View style={m.card} accessibilityRole="alert">
          <Text style={m.title}>Session expired</Text>
          <Text style={m.body}>
            Your Steam session has expired. Sign in again to confirm this
            action.
          </Text>
          <Pressable
            style={m.primary}
            onPress={onSignIn}
            accessibilityRole="button"
            accessibilityLabel="Sign in again"
          >
            <Text style={m.primaryLabel}>Sign in again</Text>
          </Pressable>
          <Pressable
            style={m.secondary}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={m.secondaryLabel}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: 12, padding: 18, gap: 10,
  },
  title: { color: theme.gold, fontSize: 18, fontWeight: '800' },
  body: { color: theme.text, lineHeight: 20 },
  primary: {
    marginTop: 6, backgroundColor: theme.accent,
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  primaryLabel: { color: theme.inkNavy, fontWeight: '800' },
  secondary: { padding: 8, alignItems: 'center' },
  secondaryLabel: { color: theme.textMuted, textDecorationLine: 'underline' },
});
