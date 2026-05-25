import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { apiBase } from '../lib/api';

export default function SignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reuses the existing web-site Steam OpenID flow:
  //   1. Open <site>/auth/steam in the in-app browser
  //   2. After Valve completes auth, the server sends the user back to
  //      the app via deep link `oceinhouse://?t=<short-lived-token>`
  //      (because we pass `mobile_redirect` and server.js bounces into
  //      our scheme — see src/web/server.js).
  //   3. The token → session exchange is handled in EXACTLY ONE place,
  //      `app/_layout.tsx`, which listens for the URL event globally.
  //      Doing the exchange here too would race the layout handler; the
  //      server-side token is single-use, so whichever loses the race
  //      sees a spurious "invalid/expired token" error.
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
      // The deep-link handler in _layout.tsx will pick up the URL via
      // Linking's `url` event and run /api/auth/complete. We just
      // navigate to Settings; the layout will redirect again to '/' once
      // the session is established, so the user lands somewhere sensible
      // regardless of timing.
      router.replace('/settings');
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
