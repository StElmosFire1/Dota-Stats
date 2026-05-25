import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api, apiBase } from '../lib/api';
import { setSessionFromSetCookieHeader, setAccountId } from '../lib/session';
import { registerForPushNotificationsAsync } from '../lib/push';

export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reuses the existing web-site Steam OpenID flow:
  //   1. Open <site>/auth/steam in the in-app browser
  //   2. After Valve completes auth, the server lands the browser on
  //      <site>/?auth=success&t=<short-lived-token>
  //   3. We pass `redirectUrl = oceinhouse://?t=...` via the
  //      `mobile_redirect` query so server.js sends the user back into the
  //      app via deep link (handled by app/_layout.tsx).
  //   Fallback: if the server isn't yet aware of `mobile_redirect`, we
  //   poll the WebBrowser result and look for the `t` token in the final
  //   URL ourselves.
  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const redirect = Linking.createURL('/');
      const url = `${apiBase()}/auth/steam?mobile_redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(url, redirect);
      if (result.type !== 'success') {
        setBusy(false);
        return;
      }
      // The deep-link handler in _layout.tsx will pick this up too, but
      // we handle it here as well in case the listener missed the event
      // (e.g. cold start race).
      const parsed = Linking.parse(result.url);
      const token =
        (parsed.queryParams?.t as string | undefined) ||
        (parsed.queryParams?.token as string | undefined);
      if (token) {
        const { setCookie } = await api.authComplete(token);
        if (setCookie) await setSessionFromSetCookieHeader(setCookie);
        try {
          const me = await api.authMe();
          if (me?.accountId) await setAccountId(me.accountId);
        } catch {}
        registerForPushNotificationsAsync().catch(() => {});
        router.replace('/settings');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.card}>
        <Text style={s.title}>Sign in with Steam</Text>
        <Text style={s.body}>
          You'll be sent to Steam to confirm your account. After signing in we'll
          bring you back to the app automatically.
        </Text>
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable style={s.button} onPress={signIn} disabled={busy} accessibilityRole="button">
          {busy
            ? <ActivityIndicator color={theme.inkNavy} />
            : <Text style={s.buttonLabel}>Continue to Steam</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg, padding: 16 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: { color: theme.gold, fontSize: 20, fontWeight: '800' },
  body: { color: theme.text, lineHeight: 20 },
  error: { color: theme.loss },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonLabel: { color: theme.inkNavy, fontWeight: '800' },
});
