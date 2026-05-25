import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Pressable,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';
import { api } from '../lib/api';
import { clearSession, getAccountId } from '../lib/session';
import { registerForPushNotificationsAsync } from '../lib/push';

type Category = {
  category: string;
  label?: string;
  description?: string;
  enabled: boolean;
  value_int?: number | null;
};

export default function Settings() {
  const router = useRouter();
  const [accountId, setAccount] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyCat, setBusyCat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const a = await getAccountId();
      setAccount(a);
      if (a) {
        const r = await api.getNotificationPrefs();
        setCategories(r.categories || []);
      } else {
        setCategories([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (cat: Category, next: boolean) => {
    setBusyCat(cat.category);
    const prev = categories;
    setCategories(cs => cs.map(c => c.category === cat.category ? { ...c, enabled: next } : c));
    try {
      const r = await api.setNotificationPrefs([{ category: cat.category, enabled: next }]);
      setCategories(r.categories || prev);
    } catch (e) {
      setCategories(prev);
      Alert.alert('Failed to update', (e as Error).message);
    } finally {
      setBusyCat(null);
    }
  };

  const sendTest = async () => {
    setTestBusy(true);
    try {
      // Ensure a token is registered first (idempotent server-side).
      await registerForPushNotificationsAsync().catch(() => {});
      const r = await api.testExpoPush();
      Alert.alert('Test push sent', `Delivered to ${r.sent} device(s).`);
    } catch (e) {
      Alert.alert('Test failed', (e as Error).message);
    } finally {
      setTestBusy(false);
    }
  };

  const signOut = async () => {
    try { await api.authLogout(); } catch {}
    await clearSession();
    router.replace('/');
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['bottom']}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={s.section}>
          <Text style={s.sectionTitle}>Account</Text>
          {accountId ? (
            <>
              <Text style={s.body}>Signed in · Steam account {accountId}</Text>
              <Pressable style={[s.button, s.danger]} onPress={signOut} accessibilityRole="button">
                <Text style={s.dangerLabel}>Sign out</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.body}>You're browsing as a guest.</Text>
              <Pressable style={s.button} onPress={() => router.push('/sign-in')} accessibilityRole="button">
                <Text style={s.buttonLabel}>Sign in with Steam</Text>
              </Pressable>
            </>
          )}
        </View>

        {accountId && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Notifications</Text>
            <Text style={s.help}>
              Push categories you toggle here apply to both the mobile app and
              the website (these settings are shared).
            </Text>
            {error && <Text style={s.error}>{error}</Text>}
            {categories.length === 0
              ? <Text style={s.body}>No notification categories available.</Text>
              : categories.map(cat => (
                <View key={cat.category} style={s.prefRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={s.prefLabel}>{cat.label || cat.category}</Text>
                    {cat.description ? <Text style={s.prefDesc}>{cat.description}</Text> : null}
                  </View>
                  <Switch
                    value={!!cat.enabled}
                    disabled={busyCat === cat.category}
                    onValueChange={(v) => toggle(cat, v)}
                    trackColor={{ true: theme.accent, false: theme.border }}
                    thumbColor={theme.text}
                  />
                </View>
              ))}
            <Pressable style={s.button} onPress={sendTest} disabled={testBusy} accessibilityRole="button">
              {testBusy
                ? <ActivityIndicator color={theme.inkNavy} />
                : <Text style={s.buttonLabel}>Send test push to this device</Text>}
            </Pressable>
          </View>
        )}

        <Text style={s.footer}>
          OCE Inhouse mobile · v0.1 · Read-only companion. Full lobby, captain
          draft, and Pro features remain on the website.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  section: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { color: theme.gold, fontWeight: '800', fontSize: 16 },
  body: { color: theme.text },
  help: { color: theme.textMuted, fontSize: 12, lineHeight: 18 },
  prefRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  prefLabel: { color: theme.text, fontWeight: '600' },
  prefDesc: { color: theme.textMuted, fontSize: 12, marginTop: 2 },
  button: { backgroundColor: theme.accent, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  buttonLabel: { color: theme.inkNavy, fontWeight: '800' },
  danger: { backgroundColor: theme.loss },
  dangerLabel: { color: '#fff', fontWeight: '800' },
  error: { color: theme.loss },
  footer: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
});
