// Minimal session-cookie store backed by expo-secure-store. The server
// returns a `oi.sid=...` cookie from POST /api/auth/complete; we hold the
// cookie value and re-attach it as a `Cookie:` header on every subsequent
// request. SecureStore is encrypted-at-rest on both iOS and Android, so
// it's an appropriate place for a bearer-equivalent secret.
import * as SecureStore from 'expo-secure-store';

const KEY = 'oi.session.cookie';
const ACCOUNT_KEY = 'oi.session.account_id';

let cached: string | null = null;

export async function getSessionCookie(): Promise<string | null> {
  if (cached !== null) return cached || null;
  try {
    cached = (await SecureStore.getItemAsync(KEY)) || '';
  } catch {
    cached = '';
  }
  return cached || null;
}

export async function setSessionFromSetCookieHeader(setCookie: string): Promise<void> {
  // `Set-Cookie: oi.sid=xxx; Path=/; HttpOnly; ...` — strip metadata, keep
  // only the `name=value` pair so we can echo it back as `Cookie:`.
  const parts = setCookie.split(/,(?=[^ ]+=)/); // multiple cookies, comma-separated
  const pieces: string[] = [];
  for (const raw of parts) {
    const first = raw.split(';')[0]?.trim();
    if (first && first.startsWith('oi.sid=')) pieces.push(first);
  }
  if (!pieces.length) {
    // Some hosts only return one cookie — fall back to the first segment.
    const first = setCookie.split(';')[0]?.trim();
    if (first) pieces.push(first);
  }
  const value = pieces.join('; ');
  cached = value;
  await SecureStore.setItemAsync(KEY, value);
}

export async function clearSession(): Promise<void> {
  cached = '';
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  await SecureStore.deleteItemAsync(ACCOUNT_KEY).catch(() => {});
}

export async function setAccountId(accountId: string | number): Promise<void> {
  await SecureStore.setItemAsync(ACCOUNT_KEY, String(accountId));
}

export async function getAccountId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCOUNT_KEY);
  } catch {
    return null;
  }
}
