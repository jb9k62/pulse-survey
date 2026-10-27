---
type: Architectural Decision
title: "ADR-0004: A week is a calendar week in UTC"
description: "How \"one response per active week\" defines a week: ISO 8601 calendar weeks in UTC, computed on the server, stored as a date on the response."
tags: [week-boundary, domain-model, time, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: requirements.md
    title: Sections 3.1, 4.1.5 and 4.1.6
  - resource: okf/design/multi-tenant-problem-space.md
    title: Section 2, the week boundary is the crux
  - resource: https://www.postgresql.org/docs/current/functions-datetime.html
    title: PostgreSQL 18 manual, date_trunc and the week field
  - resource: okf/adr/0005-rls-with-a-non-owner-app-role.md
    title: The isolation decision, which shares the same stored-key approach
---

# ADR-0004: A week is a calendar week in UTC

- **Status:** accepted
- **Date:** 2026-09-26
- **Deciders:** Jordan Hunt

## Context

Requirement 4.1.5 says a Member may submit one response per active week for a survey, and
requirement 3.1 lets us define a week as either a rolling 7-day window or a calendar week,
provided we state the choice. The
[problem space note](/design/multi-tenant-problem-space.md) argues this is the crux of the
slice: the answer decides the column, the unique constraint and the summary maths at once, and
it has to be computed in one place, on the server, at submit time.

The phrase "active week" implies a boundary that both the submit path and the summary path can
name. A boundary that cannot be stored as a key cannot carry a unique constraint, so the
mechanism and the definition have to be chosen together.

## Decision

A week is an ISO 8601 calendar week in UTC: Monday 00:00:00 to Sunday 23:59:59.999. One pure
server-side function, `weekStartOf(instant)`, returns
`date_trunc('week', instant at time zone 'utc')::date`, and both submit and summary call it.
The response stores that value in a `week_start date not null` column, and the database
enforces one response per member per survey per week with
`UNIQUE (survey_id, user_id, week_start)`.

The week is always derived on the server. The client never sends it, and a `week_start` in a
request body is ignored rather than trusted. The response form does display the week it is
answering into, read from the same function through the API, so the Member is not surprised by
the week their answer lands in.

## Consequences

### Positive

- One date column, one unique index, one `date_trunc`. The rule, the constraint and the summary
  all read the same value, so they cannot disagree.
- "This week" is a phrase the UI can use literally, and it is the same week for every
  organisation, which keeps the demo and the tests reproducible.
- UTC has no daylight saving transitions, so no boundary is ever 23 or 25 hours long and no
  week is skipped or repeated.
- The boundary is testable in isolation: one function, pure, with no database and no clock of
  its own.

### Trade-offs

- The summary resets to zero at Monday 00:00 UTC. The seed therefore has to backfill the
  current week, otherwise a reviewer running the demo early on a Monday sees an empty summary.
- A Member in UTC+13 has their week end at 13:00 Monday local time, and a Member in UTC-11 at
  13:00 Sunday local. Both are inside their own calendar week for most of it, but the last few
  hours are not. This is a real product limitation, and it is recorded as a known gap rather
  than hidden. A per-organisation timezone is the fix, and it needs a timezone column plus
  daylight saving handling, which no requirement asks for.
- ISO weeks start on Monday. Organisations used to a Sunday-based week will read the summary
  as offset by a day, so the UI shows the actual dates ("Mon 28 Sep to Sun 4 Oct") instead of
  relying on the word "week" alone.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Anchored 7-day blocks counted from the survey's activation moment | It removes the Monday reset and reads literally as a "rolling 7-day window", but "this week" then means something different per survey and is unpredictable to a Member, so the UI can only show a computed window. A calendar week is the more explainable choice for the same amount of code. |
| A trailing 7 days measured back from the moment of submit | The window moves with the clock, so it cannot be stored as a key and cannot carry a unique constraint. A Member could answer twice inside three days and then be blocked for a week, which is worse than either alternative. |
| A calendar week in the organisation's timezone | The correct answer for a full product, since the organisation's week is a local week. It needs a timezone column, daylight saving handling and tests for both transitions, and no requirement asks for it. Deferred, and recorded as a known gap. |
| A week index integer instead of a date | It is compact and avoids date arithmetic in the constraint, but it is unreadable in the database, it needs an epoch to be meaningful, and every query that wants "this week" has to compute the index anyway. The date is self-describing. |
