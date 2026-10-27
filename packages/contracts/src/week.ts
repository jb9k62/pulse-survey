import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A pure Monday check for a `YYYY-MM-DD` string. The server computes every week from its
 * own clock; this only judges a week the client sends back as a lookup key.
 */
export function isWeekStart(dateString: string): boolean {
  if (!ISO_DATE.test(dateString)) return false;
  // The regex guarantees three parts; the defaults only satisfy the type.
  const [year = 0, month = 0, day = 0] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return roundTrips && date.getUTCDay() === 1;
}

/** A week as the server describes it. The client never computes one. */
export const weekSchema = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string(),
});

export type Week = z.infer<typeof weekSchema>;
