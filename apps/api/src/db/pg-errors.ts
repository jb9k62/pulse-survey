/**
 * Walk `cause` up to three levels and duck-type a `pg` error. Drizzle wraps driver errors
 * in a `DrizzleQueryError` whose `cause` is the `pg` error, so the SQLSTATE is not on the
 * error Drizzle throws.
 */
export function unwrapPostgresError(
  error: unknown,
): { code?: unknown; constraint?: unknown } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current != null; depth += 1) {
    if (typeof current !== 'object') {
      return null;
    }
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (candidate.code !== undefined || candidate.constraint !== undefined) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

/** Whether `error` is a unique violation (SQLSTATE 23505) on the named constraint. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = unwrapPostgresError(error);
  return pgError?.code === '23505' && pgError.constraint === constraint;
}
