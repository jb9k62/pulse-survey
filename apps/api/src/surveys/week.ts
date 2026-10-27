import type { Week } from '@pulse/contracts';
import { sql, type SQL } from 'drizzle-orm';

/**
 * The one place a week is computed. `date_trunc('week', ...)` on the UTC wall
 * clock (ISO 8601: Monday to Sunday), cast to `date`. The Monday check for a week the
 * client sends back is `isWeekStart` in `@pulse/contracts`. The `::text` cast the tests
 * apply is theirs, not this fragment's.
 */
export function weekStartOf(instant: SQL): SQL<string> {
  return sql<string>`date_trunc('week', ${instant} at time zone 'utc')::date`;
}

const WEEK_LABEL_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

// Built from formatToParts and joined by hand, so the output never depends on the
// locale's punctuation. Example: `Mon 21 Sep to Sun 27 Sep`.
function formatWeekDay(dateString: string): string {
  const parts = WEEK_LABEL_FORMAT.formatToParts(
    new Date(`${dateString}T00:00:00.000Z`),
  );
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('weekday')} ${value('day')} ${value('month')}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekLabel(start: string): string {
  return `${formatWeekDay(start)} to ${formatWeekDay(addDays(start, 6))}`;
}

export function weekOf(start: string): Week {
  return { start, end: addDays(start, 6), label: weekLabel(start) };
}
