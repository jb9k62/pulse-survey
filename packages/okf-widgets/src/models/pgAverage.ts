/**
 * What `avg()` over a smallint column returns through node-postgres: a numeric, as text,
 * with PostgreSQL's display scale (for example '4.5000000000000000').
 */
export function pgAverage(values: readonly number[]): string | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return (sum / values.length).toFixed(16);
}
