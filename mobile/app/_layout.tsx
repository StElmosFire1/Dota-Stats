import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { getAccountId, setAccountId, setSessionFromSetCookieHeader } from '../lib/session';
import { registerForPushNotificationsAsync } from '../lib/push';
import { theme } from '../lib/theme';

export default function RootLayout() {
  const router = useRouter();

  // Handle the `oceinhouse://?t=<token>` deep link that Steam OpenID lands
  // on after the in-app browser hand-off in app/sign-in.tsx.
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const parsed = Linking.parse(url);
        const token =
          (parsed.queryParams?.t as string | undefined) ||
          (parsed.queryParams?.token as string | undefined);
        if (!token) return;
        const { setCookie } = await api.authComplete(token);
        if (setCookie) await setSessionFromSetCookieHeader(setCookie);
        try {
          const me = await api.authMe();
          if (me?.accountId) await setAccountId(me.accountId);
        } catch {}
        // Best-effort push registration after sign-in.
        registerForPushNotificationsAsync().catch(() => {});
        router.replace('/');
      } catch (err) {
        console.warn('[deep-link] auth complete failed:', (err as Error).message);
      }
    };
    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (ev) => handleUrl(ev.url));
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
        <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
        <Stack.Screen name="matches" options={{ title: 'Recent Matches' }} />
        <Stack.Screen name="match/[id]" options={{ title: 'Match Detail' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      </Stack>
    </>
  );
}
