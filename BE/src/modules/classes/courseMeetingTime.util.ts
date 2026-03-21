/**
 * Detects placeholder or broken meeting times from scraped catalog data
 * (e.g. PhD thesis STAT6998 as 00:00-23:59, or 0:00-0:00).
 * Used for parking recommendations and schedule "feedback" API output.
 */

function normalizeClock(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (min < 0 || min > 59) return null;
  if (h < 0 || h > 24) return null;
  if (h === 24 && min !== 0) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minutes since midnight; 24:00 → 1440 (end-of-day sentinel). */
function toMinutesSinceMidnight(clock: string): number | null {
  const [hs, ms] = clock.split(":");
  const h = parseInt(hs!, 10);
  const m = parseInt(ms!, 10);
  if (h === 24 && m === 0) return 24 * 60;
  return h * 60 + m;
}

/**
 * True when start/end look like a normal same-day class block for parking / UI lists.
 * Excludes identical times, 00:00-23:59 placeholders, and extremely long single blocks.
 */
export function hasPlausibleMeetingTimes(
  startTime: string | null | undefined,
  endTime: string | null | undefined
): boolean {
  const s = normalizeClock(startTime);
  const e = normalizeClock(endTime);
  if (!s || !e) return false;
  if (s === e) return false;

  const sm = toMinutesSinceMidnight(s);
  const em = toMinutesSinceMidnight(e);
  if (sm === null || em === null) return false;
  if (em <= sm) return false;

  const durationMin = em - sm;

  // Scraped “all day” independent study / thesis placeholder
  if (s === "00:00" && e === "23:59") return false;

  // Anything longer than a realistic single meeting block (catches other full-day junk)
  if (durationMin > 14 * 60) return false;

  return true;
}
