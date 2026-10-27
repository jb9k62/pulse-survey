/**
 * A TypeScript model of `weekStartOf` in apps/api/src/surveys/week.ts, which is SQL:
 * `date_trunc('week', instant at time zone 'utc')::date`. The real one runs in PostgreSQL, so
 * the widget cannot call it; week.test.ts pins this model to the cases in
 * apps/api/test/week.spec.ts, which run the real fragment against the database.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Monday (ISO 8601) that starts the UTC week holding `instantMs`, as `YYYY-MM-DD`. */
export function weekStartUtc(instantMs: number): string {
  const date = new Date(instantMs);
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  // getUTCDay: Sunday 0 .. Saturday 6. Days since Monday: Monday 0 .. Sunday 6.
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(midnight - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` to the UTC midnight that starts it, in milliseconds. */
export function utcMidnight(dateString: string): number {
  return Date.parse(`${dateString}T00:00:00.000Z`);
}

export function addDays(dateString: string, days: number): string {
  return new Date(utcMidnight(dateString) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The zone's offset from UTC at an instant, in milliseconds (SAST gives +2 hours). Built from
 * Intl so daylight saving in New York and Auckland is right without a time zone library.
 */
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  // Whole seconds only: formatToParts has no milliseconds.
  return asUtc - (instantMs - (instantMs % 1000));
}

/** The instant at which a local calendar day starts in `timeZone`. */
export function localMidnight(dateString: string, timeZone: string): number {
  const guess = utcMidnight(dateString);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // One refinement covers a day on which the offset changes (daylight saving).
  return guess - zoneOffsetMs(first, timeZone);
}

/** The local calendar date of an instant in `timeZone`, as `YYYY-MM-DD`. */
export function localDate(instantMs: number, timeZone: string): string {
  return new Date(instantMs + zoneOffsetMs(instantMs, timeZone))
    .toISOString()
    .slice(0, 10);
}

export { DAY_MS };
