// Task #656 — new-visitor tutorial (full edition only).
//
// Single config point for the tutorial system: the guide-page video URL,
// plus the shared "intro has been offered/seen" memory used to dedup the
// guest auto-offer so it never re-nags and never double-fires with the
// signed-in OnboardingWizard.

// ---------------------------------------------------------------------------
// Video URL config point.
//
// Set this to a YouTube/Vimeo/file URL to populate the embedded player on
// /how-it-works. Leave it empty to fall back to the graceful "coming soon"
// placeholder so the page degrades cleanly when no URL is set.
//
// Currently a narrated, on-brand walkthrough served from the full edition's
// static dir (web/public/). It covers what OCE Inhouse is, Steam sign-in,
// joining an inhouse lobby, MMR/stats, and coaching. Rebuild it with
// `node scripts/build-tutorial-video.mjs` (source assets in attached_assets/tutorial/).
// Swap in a YouTube/Vimeo share link or another hosted file any time.
// ---------------------------------------------------------------------------
export const TUTORIAL_VIDEO_URL = '/tutorial-walkthrough.mp4';

// ---------------------------------------------------------------------------
// Guest "intro seen" memory (cookie + localStorage).
//
// We stamp BOTH a localStorage flag and a cookie so the auto-offer fires at
// most once per browser even if one store is cleared/unavailable (private
// windows, storage-partitioning, etc.). Signed-in users don't use this — they
// reuse the server-side onboarding state instead.
// ---------------------------------------------------------------------------
const SEEN_KEY = 'oi_tutorial_intro_seen_v1';
const SEEN_COOKIE = 'oi_tutorial_intro_seen';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function hasSeenIntro() {
  try {
    if (localStorage.getItem(SEEN_KEY)) return true;
  } catch { /* storage unavailable */ }
  try {
    if (typeof document !== 'undefined' && /(?:^|;\s*)oi_tutorial_intro_seen=1(?:;|$)/.test(document.cookie)) {
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function markIntroSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
  try {
    document.cookie = `${SEEN_COOKIE}=1; max-age=${ONE_YEAR}; path=/; samesite=lax`;
  } catch { /* ignore */ }
}

export function clearIntroSeen() {
  try { localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
  try {
    document.cookie = `${SEEN_COOKIE}=; max-age=0; path=/; samesite=lax`;
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Embed-URL normaliser. Converts common YouTube / Vimeo share links into
// their iframe-embeddable form; returns any other URL untouched so a direct
// embed URL or a hosted .mp4 still works (the player branches on extension).
// ---------------------------------------------------------------------------
export function toEmbedUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  // youtu.be/<id>
  let m = u.match(/^https?:\/\/youtu\.be\/([\w-]+)/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  // youtube.com/watch?v=<id>
  m = u.match(/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]+)/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  // vimeo.com/<id>
  m = u.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return u;
}

export function isFileVideo(url) {
  return /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(url || ''));
}
