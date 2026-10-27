/**
 * The pure summary arithmetic. This is the only module in `apps/api/src` that counts or
 * divides. No imports from Drizzle or Nest: the service does the SQL, this file does the
 * maths, and a test walks the source tree to keep it that way.
 */

/**
 * One question's raw aggregate row. `ratingAverage` is `string | null` because that is
 * what `avg()` returns at this pin: PostgreSQL returns numerics as text. Converting it is
 * this module's job and nothing else's.
 */
export interface QuestionTally {
  ratingAverage: string | null;
  ratingCount: number;
  yesCount: number;
  noCount: number;
}

/** The tally of a question with no answers, so the service has no zero-case of its own. */
export const EMPTY_TALLY: QuestionTally = {
  ratingAverage: null,
  ratingCount: 0,
  yesCount: 0,
  noCount: 0,
};

export interface Completion {
  completed: number;
  eligible: number;
  rate: number | null;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface YesNoSummary {
  yes: number;
  no: number;
}

/** `rate` is a fraction, never a percentage and never clamped. Zero eligible is null. */
export function completionOf(completed: number, eligible: number): Completion {
  return {
    completed,
    eligible,
    rate: eligible === 0 ? null : completed / eligible,
  };
}

/**
 * A non-numeric or null raw average becomes `null`, never `NaN`. The count is kept, so a
 * rating question with answers but an unusable average is still visible as answered.
 */
export function ratingOf(tally: QuestionTally): RatingSummary {
  if (tally.ratingCount <= 0) {
    return { average: null, count: 0 };
  }
  const average =
    tally.ratingAverage === null ? Number.NaN : Number(tally.ratingAverage);
  return {
    average: Number.isFinite(average) ? average : null,
    count: tally.ratingCount,
  };
}

export function yesNoOf(tally: QuestionTally): YesNoSummary {
  return { yes: tally.yesCount, no: tally.noCount };
}
