import { describe, expect, it } from 'vitest';
import {
  localDate,
  localMidnight,
  weekStartUtc,
  zoneOffsetMs,
} from './week.ts';

// The same cases as apps/api/test/week.spec.ts, which runs the real SQL fragment against
// PostgreSQL. If the two ever disagree, this model is wrong, not the database.
describe('weekStartUtc mirrors weekStartOf', () => {
  it.each([
    ['2026-09-21T00:00:00.000Z', '2026-09-21'],
    ['2026-09-27T23:59:59.999Z', '2026-09-21'],
    ['2026-09-28T00:00:00.001Z', '2026-09-28'],
    ['2026-09-30T23:59:59.999Z', '2026-09-28'],
    ['2026-10-01T00:00:00.000Z', '2026-09-28'],
    ['2026-12-31T23:59:59.999Z', '2026-12-28'],
    ['2027-01-01T00:00:00.000Z', '2026-12-28'],
    // Monday 00:30 in SAST is Sunday 22:30 UTC: the previous week.
    ['2026-09-20T22:30:00.000Z', '2026-09-14'],
  ])('maps %s to %s', (instant, expected) => {
    expect(weekStartUtc(Date.parse(instant))).toBe(expected);
  });
});

describe('time zone helpers', () => {
  it('reads SAST as UTC+2 and New York as UTC-4 in September', () => {
    const instant = Date.parse('2026-09-21T12:00:00.000Z');
    expect(zoneOffsetMs(instant, 'Africa/Johannesburg')).toBe(2 * 3600_000);
    expect(zoneOffsetMs(instant, 'America/New_York')).toBe(-4 * 3600_000);
  });

  it('finds local midnight across a daylight saving change in Auckland', () => {
    // New Zealand moves to NZDT (UTC+13) on Sunday 27 September 2026.
    expect(
      new Date(localMidnight('2026-09-28', 'Pacific/Auckland')).toISOString(),
    ).toBe('2026-09-27T11:00:00.000Z');
    expect(
      new Date(localMidnight('2026-09-26', 'Pacific/Auckland')).toISOString(),
    ).toBe('2026-09-25T12:00:00.000Z');
  });

  it('gives the local date of an instant', () => {
    expect(
      localDate(Date.parse('2026-09-20T22:30:00.000Z'), 'Africa/Johannesburg'),
    ).toBe('2026-09-21');
  });
});
