/**
 * A model of `countEligible` in apps/api/src/surveys/surveys.repository.ts, on whole days
 * instead of timestamps. Day 0 is Monday 00:00 UTC of the summarised week and day 7 is the
 * next Monday, so the week is the half-open window [0, 7).
 *
 * The real predicate: a user is eligible when
 *   (role = 'member' AND joined_at < week end AND (deactivated_at IS NULL OR deactivated_at >= week start))
 *   OR they responded to this survey in this week.
 */

export interface Person {
  id: string;
  name: string;
  role: 'member' | 'manager';
  /** The day they joined, relative to Monday. Negative is before the week. */
  joinDay: number;
  /** The day they were deactivated, or null if never. */
  leaveDay: number | null;
  answered: boolean;
}

export type Reason =
  | 'overlaps the week'
  | 'responded this week'
  | 'joined after the week'
  | 'left before the week'
  | 'is a Manager';

export interface Verdict {
  eligible: boolean;
  reason: Reason;
}

export function overlapsWeek(person: Person): boolean {
  return (
    person.joinDay < 7 && (person.leaveDay === null || person.leaveDay >= 0)
  );
}

export function verdictFor(person: Person, countRespondents: boolean): Verdict {
  if (person.role === 'member' && overlapsWeek(person)) {
    return { eligible: true, reason: 'overlaps the week' };
  }
  if (countRespondents && person.answered) {
    return { eligible: true, reason: 'responded this week' };
  }
  if (person.role === 'manager') {
    return { eligible: false, reason: 'is a Manager' };
  }
  if (person.joinDay >= 7) {
    return { eligible: false, reason: 'joined after the week' };
  }
  return { eligible: false, reason: 'left before the week' };
}

export function countEligible(
  people: readonly Person[],
  countRespondents: boolean,
): number {
  return people.filter(
    (person) => verdictFor(person, countRespondents).eligible,
  ).length;
}

/** `completed` is the number of responses this week, whatever the person's role is now. */
export function countCompleted(people: readonly Person[]): number {
  return people.filter((person) => person.answered).length;
}

/** The five Acme Members as the seed writes them (apps/api/src/db/seed.ts). */
export const ACME_MEMBERS: readonly Person[] = [
  {
    id: 'long-ago',
    name: 'Long Ago',
    role: 'member',
    joinDay: -30,
    leaveDay: null,
    answered: true,
  },
  {
    id: 'mid-week',
    name: 'Mid Week',
    role: 'member',
    joinDay: 2,
    leaveDay: null,
    answered: true,
  },
  {
    id: 'not-answered',
    name: 'Not Answered',
    role: 'member',
    joinDay: -30,
    leaveDay: null,
    answered: false,
  },
  {
    id: 'left-mid-week',
    name: 'Deactivated Mid Week',
    role: 'member',
    joinDay: -30,
    leaveDay: 2,
    answered: false,
  },
  {
    id: 'left-before',
    name: 'Deactivated Before Week',
    role: 'member',
    joinDay: -30,
    leaveDay: -1,
    answered: false,
  },
];

/**
 * The case the OR branch exists for: both respondents promoted to Manager after answering, and
 * Not Answered joining after the week (as before that user was seeded). Without the branch the
 * rate is 2 of 1.
 */
export const PROMOTION_BUG: readonly Person[] = ACME_MEMBERS.map((person) => {
  if (person.id === 'long-ago' || person.id === 'mid-week') {
    return { ...person, role: 'manager' };
  }
  if (person.id === 'not-answered') {
    return { ...person, joinDay: 7 };
  }
  return person;
});
