---
type: Architecture
title: "Plan: interactive widgets for the guided tour"
description: "The short plan for adding React micro-worlds to the OKF viewer, so the guided tour lets a reader play with the week boundary, eligibility, the summary maths and the RLS policy."
tags: [plan, explainer, viewer, react, widgets]
generated: { by: claude-opus-5-5, at: 2026-09-26 }
sources:
  - resource: scripts/okf-view.mjs
  - resource: okf/pulse-surveys/explainer.md
  - resource: apps/api/src/surveys/summary.math.ts
  - resource: apps/api/src/surveys/week.ts
  - resource: apps/api/test/week.spec.ts
---

# Plan: interactive widgets for the guided tour

## Why

The [guided tour](/pulse-surveys/explainer.md) follows the structure in Geoffrey Litt's
"Understanding is the new bottleneck" (July 2026): background, then intuition, then details, then
a quiz. It is missing the article's third device: interactive figures, or micro-worlds, where a
reader builds intuition by changing inputs and watching the system respond. Static text can say
"Monday 00:30 in SAST is still last week"; a widget lets the reader find that out.

This is documentation tooling. It changes nothing in `apps/api` or `apps/web`, and it adds no
product feature.

## Decisions (taken by the human on 2026-09-26)

1. **A workspace package, not React from a CDN.** New `packages/okf-widgets`: React 19.3,
   TypeScript strict, built by Vite in library mode to one IIFE file. `scripts/okf-view.mjs`
   inlines that file into `viz.html`, so the viewer stays a single self-contained page and no new
   CDN script is added.
2. **The widgets run the real code.** They import `completionOf`, `ratingOf`, `yesNoOf` and
   `EMPTY_TALLY` from `apps/api/src/surveys/summary.math.ts`, and `weekOf` from
   `apps/api/src/surveys/week.ts`, through a Vite alias. Both are pure (`week.ts` imports only
   Drizzle's `sql`, and Drizzle is `sideEffects: false`, so it is shaken out). The explainer then
   cannot drift from the app's maths.
3. **Where the real code is SQL, the widget uses a labelled model.** `weekStartOf` and the RLS
   policies run inside PostgreSQL. The widget mirrors each in TypeScript, says on screen that it
   is a model, and a Vitest test pins the mirror to the same cases as the real code's tests
   (`apps/api/test/week.spec.ts` for the week, the policy table in `db/schema.ts` for RLS).
4. **Four widgets**, chosen by the human:

| Widget | The reader can | What it teaches |
| --- | --- | --- |
| `week-bounds` | Scrub an instant, pick a display time zone (UTC, SAST, New York, Auckland), use presets | The week is Monday to Sunday on the UTC clock; local midnight is not the boundary |
| `eligibility` | Move each Acme Member's join and leave day, toggle answered, promote to Manager, switch off the "or responded" branch | Why the denominator is 4 of 5, and how the rate could exceed 100% without the extra branch |
| `summary-stats` | Add and remove answers per question, set eligible to zero, feed a raw `avg()` string | `null` is not `0`, the average arrives as text, the client never divides |
| `rls-playground` | Pick a caller and flip "connect as owner", "nullif off" and "repository filter off" | Rows kept or dropped per policy, the owner exemption, the 22P02 trap, defence in depth |

## How it plugs into the viewer

- Markdown: a fenced block with the language `widget` and the widget name as its only line.
- `renderBody` finds `pre > code.language-widget`, replaces each with a mount `div`, and calls
  `window.OkfWidgets.mount(el, name)`. Switching concept calls `unmountAll()` first, so React roots
  do not leak. An unknown name renders a visible error, like a malformed quiz.
- Styling uses the viewer's existing CSS variables, so both themes work with no extra tokens.
- The viewer still renders if the widget bundle is missing (a clear placeholder, not a crash), so
  `okf:view` keeps working before `npm run build -w @pulse/okf-widgets`.

## Checks (definition of done)

- `npm run typecheck -w @pulse/okf-widgets`, `npm test -w @pulse/okf-widgets` (the model mirrors
  and each widget's key interaction through Testing Library).
- `okf:mermaid:render` (`--check-render`) is extended: it counts widget blocks in the markdown,
  asserts each mounted, and drives one interaction per widget.
- `okf:validate` 0 issues. Screenshots of each widget in both themes, checked by eye.
- No change to the API or web test results.

## Out of scope

A widget for the submit race, a live connection to the running API or database, and any change
to the product apps.

## Addendum: the Nest pipeline tour (2026-09-26)

Asked for in a TODO comment the human left in `apps/api/src/auth/auth.guard.ts`: explain guards,
interceptors and pipes, answer "the transaction opens after the guard, but how is it shared?", and
add a widget with interactive controls that shows memory use and why this approach is good.

- **A second tour concept**, `okf/pulse-surveys/nest-explainer.md`, linked from the first tour and
  from the index, rather than more sections in a tour that is already long.
- **The answer it gives:** every provider is a singleton built once at startup. The request object
  is the only per-request carrier: the guard writes `request.principal`, the interceptor writes
  `request.tx`, `@CurrentTx()` reads it, and the controller passes it down as an argument. The
  `TenantTx` parameter type makes a query outside the transaction a compile error.
- **One widget, `request-memory`.** The reader picks a way to share the transaction (argument,
  request-scoped provider, `AsyncLocalStorage`) and the number of requests in flight, and sees how
  many Nest instances are built per request, what is alive at once, and the pool of 10
  connections. A toggle for `is_local = false` leaves the old organisation stamped on idle
  connections. It is a model that counts objects, not a heap measurement, and says so on screen.
- **Grounded in source.** The bubbling of request scope is `isDependencyTreeStatic` in
  `references/nest/packages/core/injector/instance-wrapper.ts`; one instance per request (not per
  consumer, which is `TRANSIENT`) is `getInstanceByContextId` in the same file; the pool size is
  `pg-pool`'s default `max` of 10. A Vitest test pins the widget's dependency tree to the real
  constructors by reading their source.
- **Checks:** the same as above (typecheck, widget tests, `okf:validate`, `okf:mermaid:render`),
  plus screenshots in both themes. No change to `apps/api` beyond removing the TODO once done.
