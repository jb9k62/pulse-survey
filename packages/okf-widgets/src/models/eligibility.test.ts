import { describe, expect, it } from 'vitest';
import { completionOf } from '@api/surveys/summary.math.ts';
import {
  ACME_MEMBERS,
  countCompleted,
  countEligible,
  PROMOTION_BUG,
  verdictFor,
} from './eligibility.ts';

describe('the eligibility model', () => {
  it('gives the seeded Acme numbers, 2 of 4', () => {
    expect(countCompleted(ACME_MEMBERS)).toBe(2);
    expect(countEligible(ACME_MEMBERS, true)).toBe(4);
  });

  it('drops the Member who left before the week and keeps the one who left mid-week', () => {
    const byId = Object.fromEntries(
      ACME_MEMBERS.map((person) => [person.id, person]),
    );
    expect(verdictFor(byId['left-before']!, true)).toEqual({
      eligible: false,
      reason: 'left before the week',
    });
    expect(verdictFor(byId['left-mid-week']!, true).eligible).toBe(true);
  });

  it('reproduces the promotion bug that the OR branch closes', () => {
    // The shape of apps/api/test/summary-eligibility.spec.ts before memberNotAnswered was
    // seeded: both respondents promoted to Manager.
    const promoted = PROMOTION_BUG;
    expect(countCompleted(promoted)).toBe(2);
    expect(countEligible(promoted, false)).toBe(1);
    expect(completionOf(2, countEligible(promoted, false)).rate).toBe(2);
    expect(countEligible(promoted, true)).toBe(3);
    expect(completionOf(2, countEligible(promoted, true)).rate).toBeCloseTo(
      2 / 3,
    );
  });
});
