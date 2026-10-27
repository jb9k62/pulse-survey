import { describe, expect, it } from 'vitest';
import { CALLERS, runQuery, type Switches } from './rls.ts';

const off: Switches = {
  asOwner: false,
  withoutNullif: false,
  forgetFilter: false,
};

function kept(callerId: string, switches: Switches): number[] | string {
  const caller = CALLERS.find((candidate) => candidate.id === callerId)!;
  const result = runQuery(caller, switches);
  if (result.kind === 'error') return result.message;
  return result.fates.flatMap((fate, index) => (fate.kept ? [index] : []));
}

describe('the responses policy model', () => {
  it('shows a Manager their own organisation and a Member their own row', () => {
    expect(kept('acme-manager', off)).toEqual([0, 1]);
    expect(kept('blue-manager', off)).toEqual([2]);
    expect(kept('acme-member', off)).toEqual([0]);
    expect(kept('acme-not-answered', off)).toEqual([]);
  });

  it('still isolates when the query forgets its filter', () => {
    const forgot = { ...off, forgetFilter: true };
    expect(kept('acme-manager', forgot)).toEqual([0, 1]);
    expect(kept('acme-member', forgot)).toEqual([0]);
  });

  it('leaks everything to the owner when the filter is forgotten', () => {
    expect(
      kept('acme-member', { ...off, asOwner: true, forgetFilter: true }),
    ).toEqual([0, 1, 2]);
    // With the filter, the owner still loses member privacy.
    expect(kept('acme-member', { ...off, asOwner: true })).toEqual([0, 1]);
  });

  it('fails closed with no session, and raises 22P02 without nullif', () => {
    expect(kept('no-session', off)).toEqual([]);
    expect(kept('no-session', { ...off, withoutNullif: true })).toMatch(
      /22P02/,
    );
    // A signed-in caller has real ids, so nullif makes no difference to them.
    expect(kept('acme-manager', { ...off, withoutNullif: true })).toEqual([
      0, 1,
    ]);
  });
});
