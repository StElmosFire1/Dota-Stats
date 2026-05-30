// Task #461 — pure deep-link routing helpers, extracted from
// app/_layout.tsx so the routing decisions can be unit-tested without an
// Expo/React-Native runtime. Authored in CommonJS so the node --test
// runner can require() it directly while Metro/Babel still resolves the
// ESM `import` used by _layout.tsx (CJS↔ESM interop).
//
// Two surfaces are covered:
//   1. `oceinhouse://` deep links — both the Steam OpenID hand-off
//      (`oceinhouse://?t=<token>`) and the Task #414 action links
//      (`oceinhouse:///action/<kind>/<id>?slot=…`).
//   2. Expo push `data.url` payloads — shaped like `/action/<kind>/<id>?…`
//      by the server's _fanOutExpoPush callsites.

// Map a *parsed* deep-link (the shape returned by expo-linking's
// `Linking.parse`) into a routing decision. Keeping this pure means the
// test can feed it plain objects instead of mocking the native module.
//
// Returns one of:
//   { kind: 'auth', token }           — run the authComplete + session flow
//   { kind: 'action', route }         — router.push(route)
//   { kind: 'none' }                  — nothing actionable in this URL
function parseDeepLink(parsed) {
  const queryParams = (parsed && parsed.queryParams) || {};
  const token = queryParams.t || queryParams.token;
  if (token) {
    return { kind: 'auth', token: String(token) };
  }
  const path = parsed && parsed.path;
  if (path && path.startsWith('action/')) {
    const qs = Object.entries(queryParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v == null ? '' : v))}`)
      .join('&');
    return { kind: 'action', route: `/${path}${qs ? `?${qs}` : ''}` };
  }
  return { kind: 'none' };
}

// Resolve the router target from an Expo push notification's `data`
// payload. The server always encodes an absolute path in `data.url`;
// action pushes start `/action/`, everything else is a generic in-app
// path. Returns the route string to push, or null when there's nothing
// to route to.
function resolvePushRoute(data) {
  const url = data && data.url;
  if (typeof url === 'string' && url.startsWith('/')) {
    return url;
  }
  return null;
}

module.exports = { parseDeepLink, resolvePushRoute };
