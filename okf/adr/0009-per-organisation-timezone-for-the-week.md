---
type: Architectural Decision
title: "ADR-0009: The week is a calendar week in the organisation's timezone"
description: "Proposal to replace the UTC week of ADR-0004 with an ISO calendar week in an IANA timezone stored on the organisation, with daylight saving left to PostgreSQL and the stored week key unchanged in shape."
tags: [week-boundary, timezone, daylight-saving, multi-tenant, domain-model, adr]
generated: { by: claude-sonnet-5-5, at: 2026-09-29 }
sources:
  - resource: okf/adr/0004-calendar-week-in-utc.md
    title: The UTC decision this refines, and the known gap it records
  - resource: apps/api/src/surveys/week.ts
    title: weekStartOf, the one place a week is computed today
  - resource: apps/api/src/surveys/surveys.repository.ts
    title: currentWeekStart and the eligibility query that turns a week key back into instants
  - resource: https://www.postgresql.org/docs/current/functions-datetime.html
    title: PostgreSQL 18 manual, AT TIME ZONE and date_trunc
---

# ADR-0009: The week is a calendar week in the organisation's timezone

- **Status:** proposed (working draft, not yet accepted)
- **Date:** 2026-09-29
- **Deciders:** Jordan Hunt (to confirm)

This ADR refines [ADR-0004](/adr/0004-calendar-week-in-utc.md). Nothing in it is built yet.
If accepted, ADR-0004 becomes "superseded by ADR-0009" and keeps its history.

## Context

ADR-0004 defines a week as an ISO calendar week in UTC and records the cost: a Member in
UTC+13 has the week end at 13:00 on Monday local time, and one in UTC-11 at 13:00 on Sunday.
For an organisation in Johannesburg (UTC+2) the week rolls over at 02:00 on Monday, so a
Monday morning check-in at 01:30 counts towards last week. That is wrong for a product whose
whole promise is "once a week, this week". The organisation's week is a local week.

The shape of ADR-0004 was chosen to make this change small: the week is one function, stored
as a `date` key, and the database enforces `UNIQUE (survey_id, user_id, week_start)`. The
problem is now only "which zone does `weekStartOf` truncate in", plus what changes when the
zone can vary between organisations and over the year (daylight saving).

## Decision

**One IANA timezone per organisation, and the week is an ISO calendar week in that zone.**

1. **Column.** `organisations.timezone text not null default 'UTC'`, holding an IANA name such
   as `Africa/Johannesburg` or `Pacific/Auckland`. Never a fixed offset like `+02:00`, since an
   offset cannot know when daylight saving starts. The default is `UTC`, so every existing
   organisation keeps exactly the week it has today.
2. **One function, one extra argument.** `weekStartOf(instant, timezone)` returns
   `date_trunc('week', instant at time zone timezone)::date`. `at time zone` turns the instant
   into the organisation's wall-clock time, and `date_trunc` cuts that wall-clock time at
   Monday 00:00. The result is a plain date, so the stored key never has an offset to get
   wrong. `responses.week_start`, its unique constraint and its indexes do not change.
3. **The zone comes from the tenant, not the request.** The current week is computed in the
   same tenant transaction from the caller's own `organisations` row (row-level security
   already limits that table to one row), for example
   `select date_trunc('week', now() at time zone o.timezone)::date from organisations o`.
   The client never sends a zone or a week, in line with ADR-0004 and the tenant rule.
4. **Daylight saving is left to PostgreSQL's tz database, never to our arithmetic.** Because
   the key is a wall-clock date, a 23-hour or 25-hour day inside the week costs nothing: the
   week is still Monday to Sunday and still one key. The only place a week key turns back into
   instants is the eligibility query, which must change from `week_start + interval '7 days'`
   on a timestamp with time zone to
   `(week_start::timestamp) at time zone tz` and `((week_start + 7)::timestamp) at time zone tz`.
   Adding days to the date first and converting once makes the window 167, 168 or 169 hours
   long as the calendar says, instead of a fixed 168.
5. **Only a Manager changes it, and it is validated twice.** `PATCH /organisation` takes
   `{ timezone }` for the caller's own organisation. The Zod schema in `@pulse/contracts`
   accepts only names from `Intl.supportedValuesOf('timeZone')` (plus `UTC`). A database
   trigger on insert and update runs `perform now() at time zone new.timezone`, which raises
   `22023` for an unknown name. The trigger matters: an invalid zone stored in the row would
   make every week computation for that organisation fail, so it must be impossible, not
   merely unlikely. `pulse_app` gets `UPDATE (timezone)` on `organisations` only, with a
   Manager-only update policy, matching how survey writes work in migration `0006`.
6. **The week shown to the user names its zone.** The `Week` contract gains `timezone`, so the
   form says "Mon 28 Sep to Sun 4 Oct (Africa/Johannesburg)". The date arithmetic in
   `weekOf` stays UTC-safe because it only handles dates, never instants.

### Changing the zone later

A stored `week_start` is a fact: "this response counted towards the week that began on this
local Monday, in the zone in force then". **A zone change never rewrites old rows.** Rewriting
from `submitted_at` could put two of one Member's responses into the same new week and break
the unique constraint, and it would change the numbers of past summaries after the fact.
Instead the new zone applies from the moment it is saved. Around the change one week may be
counted twice or skipped for a Member (for example a Member who answered on local Sunday and
is then moved into a zone where it is already the next Monday, so they can answer again). That
is accepted, stated in the UI copy of the change dialog, and bounded to one week per change.

## Consequences

### Positive

- The rule matches what people mean by "this week", at the cost of one column and one
  argument. The database still enforces one response per week with the same constraint, and
  the summary maths is untouched, since it already groups by `week_start`.
- No migration of data: `UTC` is the default and produces exactly the keys already stored.
- Daylight saving is correct because of where the cut is made (on wall-clock time, then to a
  date), not because of special-case code. Only one query needs the conversion back to instants.
- Two organisations can be in different weeks at the same instant. That is correct, and it
  makes the tenant isolation tests stronger: the week is now tenant data too.

### Trade-offs

- **The zone change window** described above is a real, if small, inconsistency. The exact fix
  is a history table (`organisation_id, timezone, effective_from`) and a lookup by week. It is
  not built, because a zone changes rarely and the failure is bounded to one week.
- **Past-week eligibility uses today's zone.** The eligible set for an old week, which turns
  the week key back into instants, uses the current zone, so a summary of a week before a zone
  change can count a joiner or leaver near the boundary differently. It shows up only within
  hours of the boundary. The history table fixes this as well.
- **The tz database moves.** A government can change its daylight saving rules, and a
  PostgreSQL image upgrade then shifts future week boundaries for that zone. Stored keys are
  dates and do not move. Pinning the image (ADR-0003) makes the change a visible upgrade.
- **The seed and demo change.** Acme and Blue River should sit in different zones, so the demo
  can show two organisations in different weeks at the same instant. The seed then needs to
  compute its "day of this week" values in the organisation's zone, not with `utcDay`.
- Weeks still start on Monday. A configurable week-start day is a separate, unbuilt decision.

## Test plan

- **Boundaries, in the database.** `weekStartOf` is a SQL fragment, so tests pass an explicit
  instant and a zone: Johannesburg (UTC+2) at 23:30 UTC on a Sunday, which is 01:30 on a local
  Monday (new local week, old UTC week), and again at 22:30 UTC (still the old week in both).
  Auckland (UTC+13) and Pago Pago (UTC-11) on the same instants.
- **Daylight saving.** Auckland on the Sunday it springs forward (last Sunday of September)
  and the Sunday it falls back (first Sunday of April): the week key is still that Monday, and
  the eligibility window is 167 and 169 hours. Same instant on both sides of the change.
- **One response per week, in local time.** Two responses on either side of UTC Monday but
  inside one local week are refused by the unique constraint. Two on either side of local
  Monday but inside one UTC day are both accepted.
- **Tenant isolation.** Org A and org B in different zones read different current weeks at one
  instant. A Manager in A cannot change B's zone, a Member cannot change their own, and a
  request body carrying a zone or a week is ignored. An invalid zone is refused at the edge
  and, with the edge check bypassed, by the trigger.
- **Compatibility.** With every organisation on `UTC`, the existing week and summary tests
  pass unchanged.

## Delivery in two steps

1. **Read path.** The column and trigger, `weekStartOf` and `currentWeekStart` take the zone,
   the eligibility conversion, `timezone` on `Week`, the seed and the tests. The zone is set by
   the seed (and by SQL in a demo). This alone closes the limitation.
2. **Write path.** `PATCH /organisation`, the grant and policy, and a small Manager settings
   control. It can wait, since no requirement asks for editing.

## Alternatives considered

| Option | Why rejected |
|---|---|
| A timezone per user | Members of one survey would be in different weeks, so there is no single week key for the summary or the completion rate. A pulse is an organisation-wide rhythm, and the week is a property of the organisation. |
| A timezone per survey | The same problem in a smaller form: two surveys in one organisation could disagree about which week it is, and a Member would see two different "this week" labels. |
| A fixed UTC offset instead of an IANA name | Simple, but it is wrong for half the year wherever daylight saving applies, and the offset needs a manual edit twice a year. |
| Store the week as its start instant (`timestamptz`) | Handles any zone, but a key that is 167 to 169 hours long is hard to read and reason about, the unique constraint becomes harder to inspect, and the label needs the zone anyway. The date is self-describing. |
| Compute the week in application code (`Intl`, Temporal) | Two implementations of the boundary, one in Node and one in SQL for the summary queries, and two tz databases that can disagree. PostgreSQL already does the conversion, and the week has one source. |
| Let the client send its zone | Breaks the rule that the server derives the week and that tenant data never comes from the request. The same Member could pick different zones to answer twice. |
| Rewrite old `week_start` values when the zone changes | Can collide on the unique constraint, and silently changes the numbers of past summaries. A recorded, bounded inconsistency is better than a silent, unbounded one. |
| Keep UTC and only document it | The current state (ADR-0004). Acceptable for a slice, but wrong for any organisation outside UTC, and the fix is small because of how ADR-0004 stored the key. |
