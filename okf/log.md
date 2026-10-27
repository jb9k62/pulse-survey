# Bundle Update Log

## 2026-09-27
* **Manager-only survey writes**: Migration `0006_surveys_manager_writes` splits the `surveys` and
  `questions` policies into a read policy and Manager-only write policies, so the Manager rule for
  creating and changing surveys holds in the database. [Tenant isolation](/pulse-surveys/architecture.md),
  [the contract](/design/contract.md) and [the guided tour](/pulse-surveys/explainer.md) now list
  thirteen policies, and [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md) records it in its
  Revisions section. See `SOLUTION.md` section 7, row 57.
* **Demo script refreshed**: Brought [the demo script](/demo/demo.md) up to date with the closing
  review. It now has `AUTH_MODE=dev` set before the seed, the read and insert policy split, and an optional `psql` beat where a Manager's insert for a Member is refused. The AI
  section now covers the 8 slices and 47 agents, the adversarial review's worst defect and
  `ai-logs/`, and the troubleshooting table covers the seed's grants and week rewrite. Timings
  were rebalanced to about 10 minutes, with the cuts named. See `SOLUTION.md` section 7, row 58.
  A second pass (row 59) brought it to thirteen policies with Manager-only survey writes, the
  prompts-only `ai-logs/` and why, and the seed's local-only guard.
* **Closing review fixes**: `responses` and `answers` now carry a read policy and an own-row insert
  policy each (migration `0005_responses_insert_own`), so a Manager cannot insert a response for
  another user; the policy tables in [tenant isolation](/pulse-surveys/architecture.md),
  [the contract](/design/contract.md) and [the guided tour](/pulse-surveys/explainer.md) list ten
  policies. [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md) was corrected to match the code
  (grants, a pool query sees no rows, the dev grants) and gained a Revisions section.
  [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) now says the seed grants the dev
  functions only when `AUTH_MODE=dev`; its human-reviewed stamp was removed until it is re-read.
  The render gate also checks the error paths (malformed quizzes, unknown callout types) against a
  fixture bundle. See `SOLUTION.md` section 7, row 56.
* **Demo script**: Added [the demo script](/demo/demo.md), a timed script for the recorded demo
  with a talking point list per section and five diagrams. The seeded numbers it quotes (Acme 2 of
  4 eligible before the submit, 3 of 4 after) and the `psql` row-level security snippet were
  checked against the local database. See `SOLUTION.md` section 7, row 55.

## 2026-09-26
* **Nest tour**: Added [the Nest request pipeline tour](/pulse-surveys/nest-explainer.md): guards,
  the interceptor, pipes and the filter in the order Nest runs them, how the request transaction
  reaches every query as an argument, and a `request-memory` widget comparing that with a
  request-scoped provider and `AsyncLocalStorage`. Corrected a claim in
  [the isolation options](/design/tenant-isolation-options.md): a request-scoped provider is built
  once per request, not once per consumer. See `SOLUTION.md` section 7, row 53.
* **Interactive widgets**: Planned in [the widgets plan](/design/explainer-widgets.md) and built
  as `packages/okf-widgets`, a React 19.3 bundle the viewer inlines. [Guided tour](/pulse-surveys/explainer.md)
  now has four: who counts as eligible, the policy on `responses`, responses to summary, and the
  week boundary. They run the API's `completionOf`, `ratingOf`, `yesNoOf` and `weekOf`, the shared
  `summarySchema` and the web app's `SummaryPanel`; the SQL parts are labelled models, pinned by
  tests to the real code's cases. `okf:view --check-render` now proves every widget mounts and
  responds. Details in `SOLUTION.md` section 7, row 51.
* **Guided tour edit**: Corrected two claims in [Guided tour](/pulse-surveys/explainer.md) (the
  deactivated-user tip, and the client's five states), cut it by about 110 lines, drew the request as
  a sequence diagram and eligibility as a Gantt chart, and grew the quiz to seven questions with
  feedback on every option. Details in `SOLUTION.md` section 7, row 50.
* **Guided tour**: Moved the standalone architecture explainer into the bundle as
  [Guided tour](/pulse-surveys/explainer.md), first in the Application section as the entry point.
  It is the long-form version of the reference concepts: the Acme and Blue River worked example,
  the request lifecycle, the eight policies, the summary maths and the client, with a
  five-question self-check quiz. The viewer learned to render it rather than a second copy of the
  page existing: GitHub-style callouts (`> [!definition] Title`) and a `quiz` fenced block as
  click-to-check questions with a score, both theme-aware. `okf:view --check-render` now also
  proves the quiz questions render and that a click on a correct answer reveals its feedback, and
  `Explainer` is in the graph palette. Details in `SOLUTION.md` section 7, row 49.
* **Patterns review fixes**: Recorded [ADR-0008](/adr/0008-shared-contracts-package.md). Request and
  response shapes now live once, as Zod schemas in `packages/contracts`, used by both apps. The API
  gained feature modules (`SurveysModule`, `DevModule`, a `ConfigModule`, and `SessionsController` in
  `AuthModule`), the global filter no longer maps database errors, and the summary SQL moved into the
  repository. The web app fetches through one `useApiResult` hook and uses transitions for sign-in and
  sign-out. Details in `SOLUTION.md` section 7, row 42.
* **Adversarial review fixes**: Migration `0004` revokes the dev sign-in grants from `pulse_app`, and
  only the dev seed grants them back. The startup invariants now also refuse membership of a
  privileged role, tables owned in any schema, and dev grants that disagree with `AUTH_MODE`.
  `AUTH_MODE=dev` needs `NODE_ENV` `development` or `test`, and the cookie is `secure` everywhere
  else. The summary's `eligible` count includes every respondent of the week. Updated
  [Contract](/design/contract.md), [Architecture](/pulse-surveys/architecture.md),
  [API surface](/pulse-surveys/api.md), [Spec](/design/spec.md), ADR-0002, ADR-0007 and the AWS note.
* **Delivery docs**: Wrote [Production readiness on AWS](/design/aws-production-note.md), the design-only
  answer to requirement 6, and pasted its three answer sections into `SOLUTION.md` section 5 (5.1
  deployment, 5.2 logo storage and serving, 5.3 tenancy, security and scaling). Rewrote `README.md`
  with the real run steps (status, `cp .env.example .env`, a `Run it locally` section with
  `db:reset`, `dev:api`, `dev:web` and `AUTH_MODE=dev`, a database script table, a tests table for
  every root test command, and the documentation map) and corrected two stale claims: the "design
  phase, not built yet" status and the false "`.env` is optional" line. `okf:validate` reports 0
  issues over 19 concepts.
* **Two-organisation demo corrected**: Ruled that the Playwright Member submit journey signs in as
  Blue River Member Mid Week and the Manager summary journey runs first, because Acme's only
  sign-in-able Members have already answered this week and its other two are deactivated, so the
  seed cannot support "pick an Acme Member" on any day. Recorded as ruling 6 in
  [Contract](/design/contract.md) and corrected [Front end](/pulse-surveys/frontend.md) to match.
  The seed is unchanged because contract 1.9 and the Acme worked example are pinned.
* **Validation settled**: Recorded [ADR-0006](/adr/0006-zod-at-the-api-edge.md). Zod 4 schemas, run by
  Nest's built-in `StandardSchemaValidationPipe` registered as an `APP_PIPE` provider, with the schema
  attached per parameter (`@Body({ schema })`, `@Query({ schema })`). One schema language covers the
  request DTOs, the query parameters and the environment config, and `z.infer` means the type and the
  runtime check cannot drift. Checked against the pin before recording: the pipe is exported from
  `@nestjs/common`
  (`references/nest/packages/common/pipes/standard-schema-validation.pipe.ts:63`), it reads the schema
  from parameter metadata, its `exceptionFactory` already produces the flat path-prefixed message list
  the error contract wants, and the sample that proves the shape pins zod 4.6.5.
* **Production sign-in settled as out of scope**: Recorded
  [ADR-0007](/adr/0007-no-production-sign-in.md), with the alternatives it rejects (OIDC, password
  auth, magic links, a stateless signed cookie, the ungated picker). The session layer stays
  production-shaped and the gated dev route stays the only way to obtain a session, so the deployed
  slice has no way in. That is now a decision with a reason rather than an unexplained gap, and it is
  still listed in `SOLUTION.md` section 3.
* **Spec**: Wrote the plan of record, [Spec: multi-tenant pulse surveys](/design/spec.md), with the
  `design_spec` saved workflow (three parallel grounders, an architect, a reviewer; two author
  attempts). The reviewer's first pass found five blocking defects, all confirmed before the second
  draft: logout could not delete the session row because `app.current_session_token` was set only on
  the auth transaction while `set_config(..., true)` is transaction-local; the policy predicates
  compared a `uuid` column to `current_setting()`, which returns `text`, and PostgreSQL has no
  `uuid = text` operator, so `CREATE POLICY` would have failed; the "rate never exceeds 1" invariant
  had a live hole, because nothing rejected a session whose user had since been deactivated; the
  test setup dropped `public` but not `drizzle`, so the second run's migrations were a no-op; and one
  Drizzle claim was wrong, since an absent `to` serialises as `TO public`, not `TO undefined`. Four
  settled decisions were missing from the draft and were added.
* **Spec split for brevity**: the draft was 5,966 words, and requirement 7.3 asks for a short spec,
  so the sections were moved verbatim into four contract concepts and the plan was rewritten to 917
  words: what to build, the build order, the rules that must hold, the scope cut, the definition of
  done and the two open decisions. The concepts are
  [Data model](/pulse-surveys/domain-model.md), [Tenant isolation](/pulse-surveys/architecture.md)
  (which also carries the repository layout and the test plan), [API surface](/pulse-surveys/api.md)
  and [Front end](/pulse-surveys/frontend.md). Nothing was rewritten in the move, so the reviewed
  content is unchanged.
* **Two integrity gaps closed in the data model**: `UNIQUE (organisation_id, id)` on `users` with a
  composite foreign key from `responses(organisation_id, user_id)`, so a response cannot be
  attributed to a user in another organisation, and `CHECK (joined_at <= created_at)` on `users`,
  which removes the last path by which the completion rate could exceed 1. The workflow's reviewer
  raised neither; they were found in review here.
* **Week boundary settled**: Recorded [ADR-0004](/adr/0004-calendar-week-in-utc.md). A week is an
  ISO 8601 calendar week in UTC (Monday 00:00 to Sunday 23:59:59.999), computed by one server-side
  function, stored on the response as `week_start date`, and enforced by
  `UNIQUE (survey_id, user_id, week_start)`. The alternative of anchored 7-day blocks was rejected
  because "this week" would then mean something different per survey, and a trailing 7-day window
  because it cannot be stored as a key and so cannot carry the constraint.
* **Isolation settled**: Recorded
  [ADR-0005](/adr/0005-rls-with-a-non-owner-app-role.md). Tenant isolation is enforced by
  PostgreSQL row-level security, declared in Drizzle, with the API connecting as `pulse_app`, a
  non-owner role holding only DML grants, while `pulse_owner` owns the schema and runs migrations
  and seed data. Because the app role owns nothing, no `FORCE ROW LEVEL SECURITY` statement is
  needed. The tenant context (`app.current_org`, `app.current_user`, `app.current_role`) is set
  per transaction with `set_config(..., true)`. `responses` carries a second predicate so a Member
  can read only their own rows. Two queries run before a tenant context exists and get narrow
  exceptions: the session lookup reads one row by token hash, and the dev user directory is a
  `SECURITY DEFINER` function in a `dev` schema that only the dev flag reaches.
* **Survey creation settled**: A Manager-only API endpoint plus seeded surveys. The React app keeps
  the two flows the requirements name and gains no create screen, so the UI stays minimal.
* **Design notes updated**: [The problem space](/design/multi-tenant-problem-space.md) and
  [Tenant isolation](/design/tenant-isolation-options.md) now state the settled decisions and link
  the two ADRs, and the timezone and join/leave rows in the edge case table carry the settled
  reasoning. [Overview](/pulse-surveys/overview.md) now lists the decisions as settled rather than
  open. Both design notes and the overview changed, so their `verified` entries were removed: a
  review is dated and applies to the text as it stood, and these three need re-reading before the
  entry is added back.
* **Verification**: Recorded a human review on the six substantive concepts (the overview, both
  design notes, and ADR-0001 to ADR-0003) as `verified: { by: "human:Jordan Hunt", at: 2026-09-26 }`.
  The viewer then reported six `human-reviewed` and two `unverified`. The two left unverified are
  [the ADR template](/adr/template.md), which warns against carrying a `verified` entry because
  every ADR copied from it would inherit a review it never had, and [Decision records](/adr/readme.md),
  which is scaffolding. A `verified` entry is dated and applies to the text as it stands, so a
  concept whose content changes needs re-verifying.

## 2026-09-25
* **Creation**: Established the Pulse Surveys OKF v0.2 bundle: root `index.md`, `log.md`,
  the ADR area, and the initial concepts.
* **Overview**: Wrote [Overview](/pulse-surveys/overview.md) from `requirements.md`, covering what
  the service does, the rules that shape the design, the scope boundaries, and the decisions still
  open. The architecture, data model and API concepts are deliberately not written yet: their
  design decisions are still open.
* **ADR-0001**: Recorded
  [Keep the design in an OKF bundle](/adr/0001-keep-design-in-okf-bundle.md), since where design
  documentation lives is a real decision and should be reviewable like any other.
* **Tooling**: Scaffolded `scripts/okf-view.mjs` and `scripts/okf-mermaid.mjs` and the four `okf:`
  npm scripts. Pinned `@mermaid-js/mermaid-cli` to the 11.x line so both Mermaid gates run on the
  same major as the viewer's pinned `mermaid@11.17.2`. Installing the latest (12.x) would let the
  parse gate accept diagrams the viewer cannot render, and it also carried 6 high-severity audit
  findings that the 11.x line does not.
* **Reference source**: Vendored the NestJS and Drizzle sources as read-only, shallow submodules
  under `references/`, pinned by commit, with two local skills in `.pi/skills/` mapping the useful
  parts of each. See `AGENTS.md`.
* **Tenant isolation**: Wrote
  [Tenant isolation: what Drizzle and Nest actually give us](/design/tenant-isolation-options.md),
  the research feeding the open isolation decision. Read out of the pinned submodules: Drizzle
  declares policies (`pgPolicy`, `pgRole`, `enableRLS()`) and drizzle-kit emits `CREATE POLICY` and
  `ENABLE ROW LEVEL SECURITY`, but nothing anywhere sets the session variable a policy reads, and
  `FORCE ROW LEVEL SECURITY` appears nowhere in the repository. Nest contributes the application
  layer: a global guard for the organisation id, `createParamDecorator` to pass it to handlers, and
  a transaction-per-request interceptor to run `set_config(..., true)` on the same connection as the
  queries. Records the trap that an isolation test connecting as the table owner passes whether or
  not the policies are correct.
* **Problem space**: Wrote
  [The problem space: multi-tenant pulse surveys](/design/multi-tenant-problem-space.md), delegated to
  DeepSeek V4 Pro (deepseek-ai/DeepSeek-V4-Pro-0813) as a single subagent task, then reviewed and checked
  here. Covers the happy path, a table of 16 edge cases each with a verdict on whether it is real or noise
  for a timeboxed slice, the split between incidental and essential complexity, and what to build first.
  Its main argument: the week boundary is the crux, because it decides the data model, the uniqueness
  constraint and the summary at once, so one pure server-side week function should be shared by submit
  and summary.
* **Tenant isolation, checked against upstream**: Re-checked the two load-bearing claims in
  [Tenant isolation](/design/tenant-isolation-options.md) against the PostgreSQL manual and the
  drizzle-orm issue tracker rather than the pinned source alone. The absence of
  `FORCE ROW LEVEL SECURITY` at the pin holds (a case-insensitive grep for `force row level
  security` across the whole submodule returns nothing), but the note read as though it were a
  permanent fact about Drizzle. Issue #5819 and pull request #5843 add `.forceRLS()`, both open on
  2026-09-25, so the note now scopes the claim to the pin and says what to re-check on a version
  bump. Also added what `FORCE` does not fix (superusers and `BYPASSRLS` roles), what forcing the
  owner costs (seeds and `pg_dump` run as that role), the two open drizzle-kit issues that disable
  RLS on `push`, and the `.enableRLS()` versus `pgTable.withRLS(...)` drift between the pin and
  the documentation site. The separate non-owner application role is now stated as the preferred
  fix, with `FORCE` as the cheaper second option.
* **README**: Added `README.md` with prerequisites, getting started, the docs map, the four design bundle
  scripts and the reference source layout.
* **Problem space, `Included` column**: Added an `Included` column to the edge case table in
  [The problem space](/design/multi-tenant-problem-space.md), as asked. Each row now states whether
  the slice handles it and why: eleven rows are in with the reason to include them, five are out
  with the reason to leave them out. The paragraph under the table was rewritten to read as the cut
  the column makes rather than a second, separate list.
* **React 19 and a React skill**: Named React 19.3.0 in the stack, and vendored the React source
  (`references/react`, tag `v19.3.0`) and the react.dev docs (`references/react.dev`, docs site
  version 19.3) as read-only shallow submodules. Added `scripts/react-docs-index.mjs`
  (`npm run react:index`, with a `--check` mode) which parses the docs checkout and writes
  `.pi/skills/react-reference/docs-index.md`: 206 entries (200 documentation pages and 6 release
  posts), each with its canonical react.dev URL and its local path, grouped by the site's own
  sidebars. Wrote
  `.pi/skills/react-reference/SKILL.md` in the same shape as the NestJS and Drizzle skills: the
  pins, a docs table, a source table, the 19.3 version gotchas, and the project rules that override
  the docs. The skill also states plainly that this app is a client-only SPA: no React Server
  Components, no server rendering, no Server Functions, no `'use client'` or `'use server'`
  directives, and no `react-server-dom-*` runtime, with the reason and the doc page for each, plus
  the client-side practices the app follows. The same statement appears in `AGENTS.md`, `README.md`,
  `SOLUTION.md` and the overview concept, so it is not only in the skill. All four submodules and
  three skills are now listed in `AGENTS.md`, `README.md` and `SOLUTION.md`.
* **Dev sign-in**: Recorded
  [ADR-0002](/adr/0002-dev-sign-in-with-server-side-sessions.md) for the open decision on how the
  current user and organisation are identified. The decision: a credential-less dev sign-in, where
  the app lists the seeded users across both organisations and the visitor becomes whichever one
  they pick, backed by a real server-side session (an opaque token in an httpOnly cookie, matched to
  a `sessions` row, with the organisation read from that row and nowhere else). Two corrections to
  the original framing are recorded in the ADR. First, "auth-less" is the wrong name: there is
  authentication and a session, and what is missing is the credential. Second, the picker needs a
  development flag that defaults to off, because the requirements permit picking a seeded user for
  the demo, not a permanent unauthenticated path to become anyone. The requirement check is in the
  ADR, including the honest counter-argument that a cross-tenant user directory could be read as a
  breach of "one organisation must never access another's data". Cross-references added from
  [Overview](/pulse-surveys/overview.md), [The problem space](/design/multi-tenant-problem-space.md)
  and [Tenant isolation](/design/tenant-isolation-options.md).

* **Review fixes**: A DeepSeek V4 Pro subagent reviewed the two React commits and found eight
  defects, all confirmed here before they were fixed: the validation log said seven release posts
  where the index has six, and 30 react.dev URLs where the skill now has 32; `AGENTS.md` and
  `TODO.md` still said "two skills"; the index header claimed every page while the blog is excluded;
  the "Member with no organisation" row had a verdict and an Included cell that pulled in opposite
  directions; the indexer reported 225 pages where it writes 206 entries; the experimental export
  list was incomplete; and the Vite command was missing its project name. The indexer now reports
  entries and exclusions, guards both submodules and fails on a sidebar path with no file, since a
  silent drop would leave a page out of the index.
* **Local database**: Recorded
  [ADR-0003](/adr/0003-local-postgres-with-docker-compose.md): PostgreSQL runs in Docker Compose on
  the official image pinned to `postgres:18.6`, the current stable release. The ADR records the
  version 18 image change that most tutorials miss: the volume now mounts at `/var/lib/postgresql`,
  not `/var/lib/postgresql/data`. Added `compose.yaml`, `.env.example` and the `db:up`, `db:down`
  and `db:psql` scripts.
* **Project scaffolding**: Both apps now exist as a single npm workspace: `apps/api` from the
  NestJS 12.0.7 CLI and `apps/web` from `create-vite` 9.2.1 with the `react-ts` template, with a
  root lockfile and delegating `dev:api`, `dev:web`, `build`, `test`, `test:e2e`, `lint` and
  `typecheck` scripts. React is pinned to 19.3.0 to match the vendored submodule. Four defects in
  the generated output were fixed, each with a reason: the API had no `vite` dependency so its test
  script could not start, its e2e test used a `supertest/types` import that cannot resolve under
  ESM and `nodenext`, `vite-tsconfig-paths` was crawling the read-only `references/` submodules,
  and `nest build` was leaving a staged `tsbuildinfo`. `@nestjs/mau`, the paid cloud deploy CLI,
  was removed since the requirements rule out paid services and it carried 5 advisories. Full
  reasoning is in the validation log, `SOLUTION.md` section 7, row 17.
