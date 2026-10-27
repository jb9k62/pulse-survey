import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { isUniqueViolation, unwrapPostgresError } from './pg-errors.js';

const pgError = (fields: Record<string, unknown>): Error =>
  fields as unknown as Error;

describe('unwrapPostgresError', () => {
  it('finds the pg error inside a DrizzleQueryError', () => {
    const error = new DrizzleQueryError(
      'insert',
      [],
      pgError({ code: 'P0002' }),
    );
    expect(unwrapPostgresError(error)?.code).toBe('P0002');
  });

  it('returns null for an error with no SQLSTATE', () => {
    expect(unwrapPostgresError(new Error('plain'))).toBeNull();
    expect(unwrapPostgresError('text')).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  const wrapped = (constraint: string, code = '23505'): DrizzleQueryError =>
    new DrizzleQueryError('insert', [], pgError({ code, constraint }));

  it('matches a 23505 on the named constraint', () => {
    expect(
      isUniqueViolation(
        wrapped('surveys_one_active_per_org'),
        'surveys_one_active_per_org',
      ),
    ).toBe(true);
  });

  it('does not match another constraint or another SQLSTATE', () => {
    expect(
      isUniqueViolation(wrapped('other'), 'surveys_one_active_per_org'),
    ).toBe(false);
    expect(
      isUniqueViolation(
        wrapped('surveys_one_active_per_org', '23503'),
        'surveys_one_active_per_org',
      ),
    ).toBe(false);
  });
});
