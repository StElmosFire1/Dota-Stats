const TZ = 'Australia/Sydney';

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AU', {
    weekday: 'short', month: 'short', day: 'numeric',
    timeZone: TZ,
  });
}

export function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  });
}

export function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: TZ,
  });
}

export function fmtDateLong(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: TZ,
  });
}
