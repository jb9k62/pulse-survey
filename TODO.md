# TODO

Task list translated from `requirements.md`. Updated every agent turn.

## 0. Set-up and process

- [x] Turn the brief PDF into `requirements.md`
- [x] Create `SOLUTION.md` with its purpose at the top and a validation log
- [x] Create `TODO.md` (this file)
- [x] Write the agent instructions file (`AGENTS.md`, read natively by Claude Code v2.1.277+) with this project's constraints
- [x] Write a short spec or plan and commit it **before** any implementation commits
  - [x] `okf/design/spec.md` written by the `design_spec` saved workflow (3 grounders, architect,
    reviewer; 2 author attempts, 956K tokens, $0.64) and reviewed by hand (2026-09-26)
  - [x] Split the 5,966-word draft into a 917-word plan plus four contract concepts, because
    requirement 7.3 asks for a short spec (2026-09-26)
  - [x] Commit the plan before the first implementation commit (`78a9dc3` is an ancestor of the
    implementation commit `cfc5302`, checked 2026-09-27)
- [x] Write an ADR for each open decision in section 1 as it is made (ADR-0001 to ADR-0008)
- [x] Write the `architecture`, `domain-model` and `api` concepts once those decisions are made
- [x] Commit in small steps. Do not squash the history (ongoing rule; the history is unsquashed)
- [x] Update the `SOLUTION.md` validation log every agent turn
- [x] Vendor the NestJS and Drizzle sources as shallow submodules under `references/`
- [x] Add local skills (`.pi/skills/nestjs-reference`, `.pi/skills/drizzle-reference`) and point `AGENTS.md` at them
- [x] Confirm what Drizzle and drizzle-kit do for row-level security, and what Nest contributes in the application layer, by reading the pinned source
- [x] Check the row-level security claims against the PostgreSQL manual and the drizzle-orm issue tracker, and correct the note where the pin and upstream differ (2026-09-25)
- [x] Write the tenant isolation design note (`okf/design/tenant-isolation-options.md`)
- [x] Delegate the multi-tenant problem space note to DeepSeek V4 Pro (`okf/design/multi-tenant-problem-space.md`)
- [x] Add the `Included` column to the edge case table in the problem space note, so each row
  states whether the slice handles it and why (2026-09-25)
- [x] Write `README.md`: prerequisites, getting started, docs map and the design bundle scripts

## 1. Decisions (record in SOLUTION.md)

- [x] Choose where the design lives: an OKF bundle in `okf/`, with `SOLUTION.md` as the summary (ADR-0001)
- [x] Choose how PostgreSQL runs locally: Docker Compose on the latest stable image,
  `postgres:18.6` (ADR-0003, 2026-09-25)
- [x] Choose "this week": **an ISO 8601 calendar week in UTC**, one server-side function, stored as
  `week_start date` on the response with `UNIQUE (survey_id, user_id, week_start)` (ADR-0004, 2026-09-26)
- [x] Choose tenant isolation: **row-level security with a separate non-owner application role**,
  org-isolation policies on every tenant table plus own-rows policies on `responses` for Members,
  the tenant context set per transaction with `set_config(..., true)`, and application-layer
  scoping kept as a second layer (ADR-0005, 2026-09-26)
  - [x] Decided against `FORCE ROW LEVEL SECURITY` on the owner: `pulse_app` owns no table, so the
    owner exemption never applies to it and the seed and `pg_dump` keep running as the owner
- [x] Choose how surveys get created: a Manager-only `POST /surveys` endpoint plus seeded surveys,
  with no create screen in the UI (2026-09-26)
- [x] Settle the summary denominator: members whose membership overlaps the week, so `users`
  carries `joined_at` and a nullable `deactivated_at`, and undefined ratios are JSON null, never NaN
- [x] Settle the three-question limit in the schema: `position` with `CHECK (position between 1 and 3)`
  and `UNIQUE (survey_id, position)`, so a fourth question is unrepresentable
- [x] Write `okf/design/spec.md` with the `design_spec` workflow (grounding, author, review), then
  review the spec myself before any implementation code
- [x] After the spec lands: link it from `okf/index.md`, add a `log.md` entry, and run
  `okf:validate` plus both Mermaid gates
- [x] Write the `pulse-surveys/` concepts from the spec: `domain-model.md` (Data Model),
  `architecture.md` (roles, policies, tenant context, layout, test plan), `api.md` (API Reference)
  and `frontend.md` (the React flows and CSS plan)
- [x] Decide the two open decisions in the spec before the code that depends on them lands:
  - [x] API-edge validation library: **Zod 4** with `StandardSchemaValidationPipe`, registered as an
    `APP_PIPE` provider (ADR-0006, 2026-09-26)
  - [x] Production sign-in: **out of scope**, recorded as a decision with its rejected alternatives
    rather than as a bare gap (ADR-0007, 2026-09-26)
- [ ] Spot-check the spec's framework citations while implementing. The reviewer and I both read the
  same model-written draft, so the file paths are the one thing worth re-reading in the pinned source
- [ ] Re-read the three concepts whose text changed on 2026-09-26 (the overview and both design
  notes) and restore their `verified` entries, or correct what the reading turns up
- [ ] Re-read the plan and the four new concepts (`okf/design/spec.md` and
  `okf/pulse-surveys/{domain-model,architecture,api,frontend}.md`) and add `verified` entries once
  they have been read by hand
- [ ] When moving the submodules to a new tag, re-check the paths cited in the three reference skills
- [x] Choose how to identify the current user and organisation locally (token, session or header):
  credential-less dev sign-in with a server-side session cookie and a `sessions` row, gated to
  development (ADR-0002, 2026-09-25)
  - [x] Add `AUTH_MODE` (or equivalent) to `.env.example` and the README, defaulting to off, and
    make the app refuse to start with it on when `NODE_ENV=production` (`src/config.ts`, 2026-09-26)
  - [x] Write the `sessions` table: opaque token hash, user id, `expiresAt`, and a cleanup sweep
    (the table and policies are in the db-foundation slice; the dev route clears a user's expired
    sessions on sign-in, 2026-09-26)
  - [x] Write the global auth guard plus the `@Public()` marker and the `@CurrentUser()` and
    `@CurrentOrg()` parameter decorators (see `references/nest/integration/cookies/`) plus the
    `@Roles()` and `@DevOnly()` decorators and the roles guard (2026-09-26)
- [x] Design the data model: organisations, users, roles, surveys, questions, responses
  (`okf/pulse-surveys/domain-model.md`)
- [x] Choose how surveys are created: seed, fixture, admin endpoint or CLI (a Manager-only
  `POST /surveys` plus seeded surveys, recorded above)
- [x] Choose the front end stack: React 19.3.0, Vite, TypeScript strict, client-only SPA with no
  React Server Components and no server rendering, no router or data library (recorded in
  `SOLUTION.md` section 1)
- [x] Confirm the React 19.3 pins when the app is scaffolded: `react`, `react-dom` and
  `@types/react` versions must match the submodule pins (all four pinned to 19.3.0, 2026-09-25)

## 2. Project scaffolding

- [x] Layout: one npm workspace at the repository root, with `apps/api` and `apps/web` as
  workspaces and a single root `package-lock.json`, plus delegating `dev:api`, `dev:web`, `build`,
  `test`, `test:e2e`, `lint` and `typecheck` scripts (2026-09-25)
- [x] TypeScript + NestJS backend: `apps/api` from the NestJS 12.0.7 CLI, ESM, oxlint and Vitest
  (2026-09-25)
- [x] React frontend: `apps/web` from `create-vite` 9.2.1, `react-ts` template (2026-09-25)
  - [x] Scaffold with `npm create vite@latest web -- --template react-ts` (React 19.3.0)
  - [x] Pin `react`, `react-dom`, `@types/react` and `@types/react-dom` to 19.3.0 to match the
    submodules
  - [x] Vitest + Testing Library + jsdom pinned to 29.x (jsdom 30 needs Node `^24.15.0`, this
    machine runs 24.13.0)
  - [x] React Compiler wired through `reactCompilerPreset` and `@rolldown/plugin-babel`
  - [x] Smoke test proving the toolchain (`apps/web/src/App.test.tsx`): replaced by the Member-flow
    component tests in the `web-member-flow` slice, since it asserted template copy (2026-09-26)
- [x] PostgreSQL running locally (no paid cloud services, no external identity provider): Docker
  Compose on `postgres:18.6`, with `db:up`, `db:down` and `db:psql` (ADR-0003, 2026-09-25)
- [x] Create the non-owner application role if the tenant isolation ADR chooses row-level security
  (an init script or a migration, see ADR-0003 trade-offs)
- [ ] Bump `postgres:18.6` when a new 18.x minor ships
- [x] One command or short steps to run everything locally (`db:reset`, `dev:api`, `dev:web`)
  - [x] Document `dev:api`, `dev:web`, `db:up` and the test commands in `README.md`

### 2a. Scaffold follow-ups (from the row 17 review)

- [x] Drop the unused `source-map-support` dev dependency from `apps/api`; nothing imports it
  (row 56)
- [x] Align the shared tooling ranges across the two workspaces (`oxlint`, `typescript`, `vitest`,
  `@vitest/coverage-v8`) so a lockfile refresh cannot silently install two versions (row 56:
  `prettier` and `@types/node` too, and `typescript` in `packages/contracts`)
- [x] Settle one oxlint config filename: `apps/api/oxlint.json` against `apps/web/.oxlintrc.json`
  (row 56: renamed to `.oxlintrc.json`. The old name was never loaded, so the API's
  `no-explicit-any` rule was not running; checked with a probe file that the rule now fires)
- [ ] When `nest g library` adds path aliases, they resolve through Vite's native
  `resolve.tsconfigPaths` in both API vitest configs. Do not reintroduce `vite-tsconfig-paths`
  (its `tsconfck@3` peer wants TypeScript 5)

## 2b. Documentation tooling

- [x] OKF bundle skeleton (`okf/index.md`, `okf/log.md`, `okf/adr/`, `okf/pulse-surveys/`)
- [x] Validator and viewer (`scripts/okf-view.mjs`) plus `okf:validate` and `okf:view`
- [x] Mermaid parse gate (`scripts/okf-mermaid.mjs`, `okf:mermaid`) and render gate (`okf:mermaid:render`)
- [x] Pin `@mermaid-js/mermaid-cli` to 11.x to match the viewer's `mermaid@11.17.2`
- [x] `README.md`: note the parse gate's setup step (`npx puppeteer browsers install chrome-headless-shell`)
- [x] `README.md`: note the `git submodule update --init --depth 1` step after a fresh clone
- [x] React docs indexer (`scripts/react-docs-index.mjs`, `react:index`) plus its `--check` mode
- [x] Record the human review of the six substantive OKF concepts as `verified`
  (`{ by: "human:Jordan Hunt", at: 2026-09-26 }`), leaving `okf/adr/template.md` and
  `okf/adr/readme.md` unverified on purpose (2026-09-26)
- [ ] Re-verify an OKF concept whenever its content changes. A `verified` entry is dated, so a
  review that no longer matches the text defeats the viewer's trust badge
- [ ] Re-check `okf/adr/template.md` and `okf/adr/readme.md` if either grows real content rather
  than scaffolding

## 2c. Reference source

- [x] Add `references/nest` pinned to NestJS tag `v12.1.0` (shallow)
- [x] Add `references/drizzle-orm` pinned to drizzle-orm tag `0.45.3` (shallow)
- [x] Add `references/react` pinned to React tag `v19.3.0` (shallow)
- [x] Add `references/react.dev` pinned to the docs checkout for site version 19.3 (shallow)
- [x] Write `.pi/skills/nestjs-reference/SKILL.md` as a path map into the vendored source
- [x] Write `.pi/skills/drizzle-reference/SKILL.md` as a path map into the vendored source
- [x] Write `.pi/skills/react-reference/SKILL.md` as a path map into the vendored docs and source,
  with the generated `docs-index.md` beside it
- [x] Point `AGENTS.md` at all three skills and state that the submodules are read-only
- [ ] Keep the skill path maps honest: verify cited paths when the submodules move to a new tag
- [ ] Re-check whether drizzle-orm has shipped `.forceRLS()` (issue 5819, pull request 5843), and
  whether `pgTable.withRLS(...)` has replaced `.enableRLS()`, when the submodules move to a new tag

## 3. Task 1: Backend

- [x] Each user belongs to exactly one organisation
- [x] Each user has one role: Manager or Member
- [x] Surveys belong to an organisation
- [x] Limit surveys to at most 3 questions
- [x] Question types: rating (1 to 5) and yes/no
- [x] Validate answers (rating is 1 to 5, yes/no is a boolean) (the Zod DTO shape plus the
  service check against the survey's question types, 2026-09-26)
- [x] Managers can create and manage surveys for their own organisation only
  (`GET /api/surveys`, `POST /api/surveys` and `PATCH /api/surveys/:id`; another organisation's id
  is a 404, never a 403, 2026-09-26)
- [x] Members can submit one response per active week per survey (enforce it, ideally in the database too)  
  (the database constraint is in place and `POST /api/surveys/:id/responses` maps the empty
  `onConflictDoNothing` result to a 409, 2026-09-26)
- [x] Weekly summary endpoint (`GET /api/surveys/:id/summary`, 2026-09-26):
  - [x] completion count
  - [x] completion rate (compared to the number of members in the organisation)
  - [x] rating questions: average and count
  - [x] yes/no questions: count per option
- [x] Strict data isolation between organisations on every query and endpoint (surveys, responses
  and summary, 2026-09-26)
- [x] Role checks (Member cannot see manager-only data or actions) (the auth and roles guards are
  in place and the 403 path is proven through a probe controller; the manager-only endpoints land
  in the routes slice, 2026-09-26)
- [x] Seed data: at least 2 organisations, a few Managers and Members in each, at least one active survey per organisation
- [x] Tests that prove isolation (org A cannot read or write org B data) (the responses and
  summary half is in `test/isolation.e2e-spec.ts`, 2026-09-26)
  - [x] Isolation test through a real session, so it asserts that an org A session cannot read org B
    by id, not only that a repository filter works (`test/isolation.e2e-spec.ts`, surveys half,
    2026-09-26)
  - [x] Test that the dev routes are absent (404) when the dev flag is off, and that a request with no
    session is rejected (`test/dev-gate.e2e-spec.ts`, `test/auth.e2e-spec.ts`, 2026-09-26)
  - [x] Test that a tampered or expired session token is rejected, and that logout revokes it
    (`test/auth.e2e-spec.ts`, 2026-09-26)
- [x] Tests for the one-response-per-week rule and the summary maths (`test/submit.e2e-spec.ts`,
  `test/summary.e2e-spec.ts`, `test/summary-maths.spec.ts`, 2026-09-26)

## 4. Task 2: React app

- [x] Keep it a client-only SPA: no React Server Components, no server rendering, no Server
  Functions, no `'use client'` or `'use server'` directives (grep finds none, 2026-09-27)
- [x] Follow the client-side practices in `.pi/skills/react-reference/SKILL.md`: pure components,
  Effect cleanup that ignores or aborts a stale response, derived values computed in render,
  stable list keys, an error boundary at the top, StrictMode left on (row 44 review)
- [x] Simple local "log in" by picking a seeded user
  - [x] `GET /dev/users`: seeded users with their organisation and role, 404 when the dev flag is off
  - [x] `POST /dev/sessions`: create a session, 404 when the dev flag is off
  - [x] `DELETE /sessions`: log out by deleting the row and clearing the cookie
- [x] Member: see own organisation's active survey (MemberScreen, 2026-09-26)
- [x] Member: submit a response (MemberScreen, 2026-09-26)
- [x] Manager: see the weekly summary for a survey (`ManagerScreen` and `SummaryPanel`, 2026-09-26)
- [x] Follow-ups from the `web-member-flow` slice:
  - [x] Replace the `App` manager placeholder (`ManagerScreen`) when the manager slice lands
    (replaced by `ManagerScreen` in the `web-manager-flow` slice, 2026-09-26)
  - [x] Accept the single `react/only-export-components` warning from exporting `useSession` beside
    the provider, and do not split the file or add a disable comment (superseded: the
    `SessionProvider` split in the conformance fixes removed the warning)
  - [ ] Propose one sentence for `okf/pulse-surveys/frontend.md`: the provider performs the
    bootstrap fetch, and a failed `/api/me` is its own bootstrap failure state
- [x] Follow-ups from the `web-manager-flow` slice:
  - [x] The Playwright journeys (`npm run test:e2e:web`) are still pending: `apps/web/e2e/` does
    not exist and there is no Playwright config yet, so the manager flow is proven against a
    stubbed fetch only (done in the `playwright-e2e` slice: `apps/web/e2e/playwright.config.ts`
    and `apps/web/e2e/journeys.spec.ts`, 2026-09-26)
  - [ ] The e2e spec hardcodes the fixture ids, names and titles (`apps/web/e2e/journeys.spec.ts`),
    so a fixture rename breaks it at the first assertion; importing from `apps/api` would cross
    the workspace boundary for one test
  - [ ] A Playwright run that straddles the Sunday to Monday UTC boundary can fail the pinned
    numbers, because `db:reset` seeds the week it runs in and the tests then run in the next one
  - [x] The Playwright screenshots and `test-results` are generated artefacts, so they are
    gitignored (`apps/web/e2e/screenshots/`, `apps/web/e2e/test-results/`)
  - [x] `SignedInShell` renders a `<main>` and `MemberScreen` returns another `<main>`, so the
    authenticated pages nest two `main` elements. Cosmetic, and out of scope for the manager slice
    (fixed in the row 42 restyle: one shared `Layout` owns the only `<main>`, 2026-09-26)
- [x] Keep the UI minimal
- [x] UI restyle (row 42, 2026-09-26): light and dark theme toggle, self-hosted retro fonts
  (VT323 and IBM Plex Mono), top bar, two-column Manager view, key-style Member choices,
  summary bars
- [x] Demo flow uses at least 2 organisations to show isolation (the three Playwright journeys:
  Acme and Blue River summaries, the Blue River Member submit and duplicate, and the
  cross-organisation summary `404` in `apps/web/e2e/journeys.spec.ts`, 2026-09-26)

## 5. Task 3: AWS design note (in SOLUTION.md, no code)

- [x] Deployment (app containers, managed PostgreSQL, static frontend hosting) (design note in
  `okf/design/aws-production-note.md` and `SOLUTION.md` 5.1, 2026-09-26)
- [x] Organisation logo: storage and serving with low backend bandwidth and cost, secure access
  (`SOLUTION.md` 5.2, 2026-09-26)
- [x] First priorities for tenancy, security and scaling (`SOLUTION.md` 5.3, 2026-09-26)

## 6. Task 4: AI-assisted delivery

- [x] SOLUTION.md: AI workflow end to end (sections 6.1 to 6.5, row 56)
  - [x] tools used
  - [x] how the task was set up for the tools
  - [x] how the work was broken down
  - [x] what was given to the AI and what I kept for myself
  - [x] how output was reviewed and improved
  - [x] what I would change next time (drafted by the agent from the log; the human to read and
    edit into their own words)
- [x] SOLUTION.md: validation (what I checked, what I rejected or rewrote, how I knew it was
  correct): section 6.6 summary plus the section 7 log
- [x] Commit the agent instructions file (`AGENTS.md`, `4dc3108`)
- [x] Commit the spec or plan before implementation (`78a9dc3`)
- [x] **Session logs:** `ai-logs/README.md`, the sessions and prompts only (row 57; the full
  transcripts exported in row 56 leaked an API key and other project names and were replaced)
  - [x] remove anything personal (names, emails, paths, tokens): only typed prompts are kept,
    they are redacted, the redaction terms live outside the repository, and every line of the
    output was read by hand
  - [x] if export is not possible, say so in SOLUTION.md and describe the sessions (export worked;
    6.4 describes what is left out)
- [ ] Re-export `ai-logs/` just before hand-in, so it includes the last sessions, and read it

## 7. Deliverables

- [ ] Single GitHub repository with all source code
- [x] `README.md` with local run steps (docs tooling so far; add backend and database steps once the app exists)
- [x] `README.md`: add backend, database and front end run steps once those exist (status, `cp .env.example .env`, `Run it locally` with `db:reset`, `dev:api`, `dev:web` and `AUTH_MODE=dev`, a database script table, a tests table and the documentation map, 2026-09-26)
- [x] `SOLUTION.md`: design and trade-offs, known gaps, next steps, AWS note, AI workflow and validation
  (no _TBD_ left, row 56)
- [x] `ai-logs/` folder
- [x] Commit history shows progress (not squashed)
- [ ] Video demo, 5 to 10 minutes, with voice-over:
  - [ ] show the working project
  - [ ] walk through the code architecture
  - [ ] explain key design decisions and trade-offs
  - [ ] explain the AI workflow and show it live, including at least one place where I corrected or rejected output

## 8. Orchestration workflows (pi dynamic workflows)

- [x] Add pi-config agent types for the workflow roles: `architect` (Flash 4.1, `thinking: max`), `grounder` (Flash 4.1, `thinking: low`), `implementer` (Flash 4.1, `thinking: low`); reuse `code-reviewer` for review
- [x] Run `./install.sh` in pi-config and confirm the three new agent types copied to `~/.pi/agent/agents/`
- [x] Write `workflows/design-spec.workflow.js`: parallel Flash 4.1 grounding per layer, then the architect (Flash 4.1 max) authors and the code-reviewer (Flash 4.1 max) reviews `okf/design/spec.md`
- [x] Write `workflows/implement-slices.workflow.js`: Flash 4.1 (max) contract, then vertical slices of think (Flash 4.1 max) -> implement (Flash 4.1 low) -> review (Flash 4.1 max) + test -> fix, plus final verify and visual handoff
- [x] Move the architect agent from V4 Pro (high) to Flash 4.1 (max) after the three-model design eval
- [x] Move the code-reviewer agent to Flash 4.1 (max) and drop V4 Pro from the agent definitions and workflow scripts
- [x] Write `scripts/save-workflows.mjs` and register both as project saved workflows (`design_spec`, `implement_slices`)
- [x] Re-register both saved workflows after pinning the review calls to `thinking: "high"`
- [x] Run a zero-token structural check of both saved workflows (parse, phases, agent types, no nondeterminism) and confirm the four agent types are installed
- [x] Run `design_spec` to produce `okf/design/spec.md`, then commit it before any implementation code
- [x] Align `implement_slices` with the spec's build order before the run: the default slices now
  follow the five steps in `okf/design/spec.md` plus the docs step, every slice names the concepts
  it must read, and every verify command is one the repo actually has (2026-09-26)
- [x] Run `implement_slices` to build the vertical slices, then review the run output (started
  2026-09-26, run `implement-slices-mui3l765-etmhbl`; reviewed in row 39)
- [x] Do the visual browser pass from the `implement_slices` handoff (done 2026-09-26, see below)

## 9. Implementation run (`implement_slices`, 2026-09-26)

Pre-flight done by the orchestrator before the workflow started, so the slices spend their budget on
the app rather than on plumbing:

- [x] Install the dependencies the spec names in `apps/api`: `drizzle-orm` 0.45.3, `drizzle-kit`
  0.31.11, `pg`, `@types/pg`, `tsx`, and `zod` pinned to 4.6.5. npm had resolved `zod` to 3.25.76 by
  deduping against `@mermaid-js/mermaid-cli`, which contradicts ADR-0006
- [x] Write `.env` (gitignored) and extend `.env.example` with `DATABASE_URL_OWNER`,
  `DATABASE_URL_APP`, `TEST_DATABASE_URL_OWNER`, `TEST_DATABASE_URL_APP`, `AUTH_MODE`,
  `SESSION_TTL_HOURS` and `API_PORT`
- [x] Add the root scripts the definition of done names: `db:bootstrap`, `db:generate`, `db:migrate`,
  `db:seed`, `db:reset` and `test:e2e:web`
- [x] Make `npm test` and `npm run test:e2e` bring the database up and run `db:bootstrap` first,
  because `test/rls.spec.ts` is an integration test included by the unit config and needs `pulse_test`
- [x] Start PostgreSQL 18.6 in Docker Compose and confirm it with `select version()`
- [x] Re-register the saved workflows with `node scripts/save-workflows.mjs` and check the saved
  script matches `workflows/implement-slices.workflow.js` byte for byte

Follow-ups once the run lands:

- [x] Read the run ledger and the conformance review, and check every "complete" claim against the
  code rather than against the summary (2026-09-26: 8 of 8 slices complete, 47 of 47 agents, the
  conformance review approved with 8 nits, and each blocking finding from the fix rounds was checked
  in the code: the `nullif` fix, the delete-row-count assertion, the archived-message assertion and
  the null-average test)
- [x] Spot-check the framework citations in `okf/pulse-surveys/` and `okf/design/spec.md` (the author
  and the reviewer read the same model-written draft): read `standard-schema-validation.pipe.ts`,
  `pg-core/policies.ts`, `pg-core/roles.ts`, `pg-core/table.ts` and `sql/functions/aggregate.ts` at
  the pin, and checked the contract's 11 endpoint rows against the 11 route decorators (2026-09-26)
- [x] Confirm `db:reset`, `typecheck`, `lint`, `test`, `test:e2e`, `test:e2e:web` and `okf:validate`
  all pass locally, not only inside the workflow (2026-09-26: typecheck clean, lint warning free,
  API 59 and web 50 unit tests, 77 API e2e tests, 3 Playwright journeys, 0 OKF issues)
- [x] Fix the conformance nits that were left: the unconditional `EXECUTE` grant on the two `dev`
  functions when `AUTH_MODE=off` (row 41), the untested future-Monday summary and the untested
  `main.ts` (row 56). The six round trips in `summary.service.ts` stay, recorded as a trade-off in
  `SOLUTION.md` section 2 and a next step in section 4
- [x] Fixed the conformance nits that were real: the DoD wording about which suite runs the RLS
  suite, the migration count in three documents, `strict` in `apps/web/tsconfig.node.json`, the
  missing no-`any` rule in `apps/web/.oxlintrc.json`, the case-insensitive `NODE_ENV` check, the
  health-route comment, and the `SessionProvider` split that silenced the last lint warning
  (2026-09-26)
- [x] Fix the tenant-setting placeholder: a rolled-back `set_config(name, value, true)` leaves the
  setting as an empty string on a reused pooled connection, so `current_setting(name, true)` is not
  NULL and `::uuid` can throw. Fixed by wrapping the two uuid fragments in `nullif(..., '')`
  (`apps/api/src/db/tenant-settings.ts`), updating the contract and `architecture.md`, and adding
  migration `0003_tenant_settings_nullif` to alter the eight policies. Found by `test/rls.spec.ts`
  (2026-09-26)
- [x] Fix the RLS suite gap the conformance review found: `deleteSessions` now returns the delete
  row count, and a case asserts 0 rows for a non-matching token and 1 for the matching token, so
  dropping the `sessions_delete_own_token` policy fails `test/rls.spec.ts` (2026-09-26)
- [x] Later slices: address the remaining `db-foundation` review nits (revoke `dev.list_users()`
  when the dev flag is off (row 41), update the contract migration table for `0003` to `0005`, make
  the seed update week-dependent rows, apply `assertTestDatabase` to `TEST_DATABASE_URL_APP`, and
  type `FixtureSurvey.status` as its own status type, all row 56)
- [ ] Note the two truncated composite foreign key names (PostgreSQL cuts identifiers at 63
  characters) in `domain-model.md`
- [x] Later slices: API-edge answer validation, the real session guard and interceptor transactions,
  and the endpoints the summary slice needs (all landed in the slices)
- [x] Paste the AWS design note into `SOLUTION.md` section 5 (the concept is
  `okf/design/aws-production-note.md` and sections 5.1 to 5.3 carry the same prose, 2026-09-26)
- [x] Review `okf/design/contract.md`, which the workflow writes and the repo did not have
  (2026-09-26: read the structure and checked the endpoint table, the migration table and the pinned
  source list against the code)
- [x] Re-verify the OKF concepts whose text the run changes (2026-09-26: `api.md`, `architecture.md`
  and `frontend.md` changed, and none of them carries a `verified` entry, so there is no stale human
  review to withdraw; the bundle reads three human-reviewed and sixteen unverified)
- [x] Do the visual browser pass from the handoff (done 2026-09-26: picker, Member form, the live
  duplicate message, the Manager summary with 2 of 3 completed and 67%, and the cross-organisation
  `404`; screenshots were written to `/tmp/pulse-visual/` and not committed)

### Tenant plumbing follow-ups (tenant-plumbing slice, 2026-09-26)

- [x] Later slices: update the "Later slices" line above, since the real session guard and the
  request/interceptor transactions landed in this slice
- [x] Revoke `EXECUTE` on `dev.list_users()` and `dev.create_session()` when `AUTH_MODE=off`. Today
  the auth guard returns 404 before either function runs, but the grant is unconditional. The row
  40 review showed any `pulse_app` connection can list every organisation's users and mint a
  Manager session today, so raise this from "later mistake" to a fix before hand-in. Preferred fix:
  apply the dev schema only to dev and test databases (done in row 41: migration `0004` revokes,
  the seed grants, and startup refuses a mismatch, 2026-09-26)
- [x] Cover `main.ts` with a test or a scripted check (`test/main.e2e-spec.ts`, row 56: builds the
  API and starts `main.js`; proves the port, the `/api` prefix and both start-up refusals. The
  cookie flags stay covered by `auth.e2e-spec.ts` through the testing module)
- [x] Document `dev:api`, `dev:web`, `db:up` and the test commands in `README.md`, including the
  `AUTH_MODE=dev` requirement for the seeded picker (2026-09-26)
- [x] Prove the 409 mapping end to end in the responses slice. It is unit-tested in
  `http-exception.filter.spec.ts` and has no route yet (the submit route now proves it through a
  real session, 2026-09-26)
- [x] The summary accepts a future Monday and returns a zero week. This is intentional (the value is
  a lookup key, not a boundary); now tested in `summary.e2e-spec.ts` (row 56)

### Adversarial review of `cfc5302` (row 40, 2026-09-26)

- [x] Comment the non-obvious database code: composite keys, constraints, policies, migrations,
  tenant settings and the summary SQL
- [x] Correct the `tenant-settings.ts` comment: the '' setting appears after a commit too
- [x] Add `pg_has_role(current_user, 'pulse_owner', 'MEMBER')` to `assertDatabaseInvariants`, and
  count owned tables in every schema, not only `public` (row 41, generalised to any privileged role)
- [x] Do not rely only on `NODE_ENV` for the dev-sign-in refusal and the `secure` cookie, or
  document that production must set it (row 41: allowlist, unset counts as production)
- [x] Decide what `eligible` means when a respondent's role changes, or correct the section 3 claim
  that the rate never exceeds 1 (row 41: every respondent is eligible)
- [x] Decide whether a seeded dev database should be allowed to start with `AUTH_MODE=off` (row 56:
  yes. The seed now grants the dev functions only with `AUTH_MODE=dev` and revokes them with `off`,
  so the grants follow the flag and the startup check stays strict both ways)

### Patterns review against the NestJS and React skills (row 44, 2026-09-26)

- [x] Share the request and response shapes as Zod schemas in `packages/contracts` (ADR-0008)
- [x] Split the API into feature modules; `SessionsController` in `AuthModule`; global `ConfigModule`
- [x] `Public` and `DevOnly` through `Reflector.createDecorator`; `CurrentUser` throws, `OptionalUser`
  is the nullable form
- [x] Move the summary SQL into `SurveysRepository`; `pg-errors.ts` out of the filter; map the
  one-active-survey `23505` in the service
- [x] Parse config once; turn `strictPropertyInitialization` back on
- [x] One `useApiResult` hook; transitions for sign-in and sign-out; disable the Member form after
  an answered submit; round the average; no cast for a 204
- [x] Prettier for the web app and the contracts package
- [x] Format `apps/api` with the shared Prettier config (38 files, `c649ac0`), and the rest of the
  repository except Markdown (`13f2f11`, row 45)
- [x] Test that a double click on Sign out sends one `DELETE` (`App.test.tsx`, row 56; fails when
  `disabled={isPending}` is removed)
- [x] Rebuild `@pulse/contracts` on change under `nest start --watch` (row 56: `start:dev` runs a
  contracts `tsc --watch` too, and the API restarts when a contract's types change)
- [x] Restart the API on a runtime-only contract change (for example a `.max()` limit), which
  leaves the `.d.ts` unchanged, so Nest's compiler does not restart. `node --watch-path` on both
  `dist` folders was tried and dropped (restarts overlapped and raised `EADDRINUSE`). Fixed in row
  57: `nest-cli.json` watches the contracts' built `.js` as an asset, which Nest restarts on, and
  `scripts/start-dev.sh` stops both watchers and the app on Ctrl-C, on SIGTERM, and when npm dies
- [x] Comment sweep by a subagent (rows 45 and 46): every hand-written source file, with an
  end-to-end row-level security overview in `apps/api/src/db/schema.ts`
- [x] Correct ADR-0005 to match the code (row 56: the grants, a pool query sees no rows, the dev
  grants, plus a Revisions section; the one-policy point was fixed in the code instead, below)
- [x] Seed CLI: refuse to grant the dev functions unless the target is a dev or test database
  (row 56: the seed runs only with a development `NODE_ENV` and grants only with `AUTH_MODE=dev`)
- [x] Seed re-run in a later week inserts nothing (fixed ids), so seeded responses stay in their
  first week until `db:reset` (row 56: the seed rewrites membership dates and the fixture
  responses for the current week; checked by moving them back a week and re-seeding)
- [x] `bootstrap.sql` hardcodes `ALTER DATABASE pulse` although `POSTGRES_DB` is configurable
  (row 56: `db:bootstrap` passes `db_name`)
- [x] `drizzle.config.ts` repeats the root `.env` loading in `src/db/load-env.ts` (row 56)
- [x] `countSessionsWithHash` in the test helper types the `int` count as `string` (row 56)
- [x] Decide whether the `responses` policy should stop a Manager inserting a response for another
  user of the organisation (row 56: yes. Migration `0005` splits `responses` and `answers` into a
  read policy and an own-row insert policy; `rls.spec.ts` proves a Manager insert for a Member is
  refused with 42501)
- [x] `scripts/okf-mermaid.mjs` prints four em-dashes in console output (row 56)
- [x] Seed one active Member with no answers in each organisation (`memberNotAnswered`, row 47);
  pinned counts moved to Acme 2 of 4 and Blue River 1 of 4
- [x] Write the guided tour as a bundle concept (`okf/pulse-surveys/explainer.md`, row 44) with the
  current seed numbers, 2 of 4 and 1 of 4, and teach the viewer to render its callouts and quiz
  rather than shipping a second copy of the page
- [x] Edit the guided tour for correctness and concision, with a Gantt chart for eligibility, a
  sequence diagram for the request and a seven-question quiz with feedback on every option (row 50)
- [x] Simplify the front desk, locks and fading stamp picture in the explainer (row 51)
- [x] Plan and build React widgets for the guided tour (`packages/okf-widgets`, row 51): week
  bounds, eligibility, summary stats and an RLS playground, driven by the render gate
- [x] Give `packages/okf-widgets` an oxlint config, as the two apps have (row 56; `npm run lint`
  covers it, and `pgAverage` moved to `src/models/` to clear the one warning)
- [x] A Nest explainer (guards, interceptors, pipes, how the request transaction is shared),
  asked for in a TODO comment the human left in `apps/api/src/auth/auth.guard.ts`: the second
  tour, `okf/pulse-surveys/nest-explainer.md`, with the `request-memory` widget (row 53)
- [x] Commit the Nest tour and the `request-memory` widget (row 54)
- [x] Commit the widgets package and the viewer changes (`fd1687d`, `8b7b172`)
- [x] Add a fixture concept that exercises a malformed `quiz` block (no correct option, two correct
  options) and an unknown callout type, so the render gate covers the error paths and not only the
  happy one (row 56: `scripts/fixtures/okf-render-errors`, run by `npm run okf:render:fixture`; the
  gate now counts quiz errors and known and unknown callouts on every concept, and fails when the
  viewer turns an unknown type into a callout)
- [ ] Print or export the whole bundle from `okf/viz.html`: the reading pane renders one concept at a
  time, so there is no single-document view
- [x] Show which end of the rating scale is highest: a hint under each rating question and "out
  of 5" on the summary average (row 48)
- [x] Run the Playwright journeys against the new "out of 5" summary text (3 passed, row 56)
- [x] Demo script for the recorded walkthrough, `okf/demo/demo.md` (row 55)
- [ ] Rehearse the demo script against a fresh `db:reset` and trim to the recorded length

### Closing review (row 56, 2026-09-27)

- [ ] Re-read ADR-0002 and restore its `verified` entry: row 56 changed one sentence (the seed
  grants the dev functions only when `AUTH_MODE=dev`), so the old stamp was removed
- [ ] Read `SOLUTION.md` sections 2, 4 and 6.1 to 6.6, drafted by the agent from the log, and put
  them in your own words where they do not match your view (6.3 especially)
- [ ] The validation log has two rows numbered 51; renumber if it matters
- [ ] Push to a GitHub repository (deliverable 8.1); `origin` is a self-hosted server today
- [ ] Record the video demo (deliverable 8.2), after a fresh `db:reset`

### Adversarial review of row 56 (row 57, 2026-09-27)

- [ ] Rotate the Context7 API key that the first export put in `ai-logs/`. The commit was rewritten
  before any push and no reachable commit holds it, but it sat in plain text on disk
- [x] Take the key out of history: `47a5917` rewritten in place as `704630d` (the human chose this
  over the no-rewrite rule), `d67c43e` replayed as `bf09a65`; `git log -S` finds no key and none
  of the other project names on `main`
- [x] Redact credential shapes such as `ctx7sk-` and `--api-key <value>`: moot for tool output,
  since `ai-logs/` now holds typed prompts only, and kept as rules for the prompts
- [x] Move the personal redaction terms out of `scripts/export-ai-logs.mjs` into
  `~/.config/ai-logs-redact.json`; the script refuses to run without it
- [ ] Decide whether the name in the ADR Deciders lines, the `verified` entries and the commit
  author email stay public (a human choice, not changed)
- [x] Correct row 56, `SOLUTION.md` 6.4 and the `TODO.md` tick that overstated the privacy scan
- [x] Seed guard: the workspace script no longer defaults `NODE_ENV`, the root script sets it, and
  the seed refuses a database that is not on this machine
- [x] After `test:e2e:web`, re-seed with the `.env` `AUTH_MODE` (the script does it at the end)
- [x] Section 1 said three concepts are human-reviewed; now two
- [x] ADR-0005's revision overstated that the split was "the shape the decision always described"
- [x] `explainer.md`: policy 13's subquery tests the owner, not the role
- [x] `main.e2e-spec.ts`: corrected the `.env` comment, and the owner test changes the URL with a
  connection parameter, so it no longer depends on the host spelling
- [x] Render gate: the fixture declares its expected counts in `render_expect`, checked
  independently of the viewer's parsers (a broken `parseQuiz` now fails it), and
  `renderCallouts` calls `calloutMarker`
- [x] The export over-redacted code identifiers: moot, since tool output is no longer exported
- [x] `surveys` and `questions` policies checked only the organisation, so at database level a
  Member session could write surveys: migration `0006` makes writes Manager-only, with tests
- [x] Refresh the demo script after the closing review fixes (row 58), and again after the Manager-only survey writes and the prompts-only `ai-logs` (row 59)

### Per-organisation timezone (ADR-0009, proposed 2026-09-29)

- [x] Write ADR-0009 as a working draft, and list it in `okf/adr/readme.md`
- [ ] Human: read ADR-0009, then accept, change or reject it (it does not supersede ADR-0004 until accepted)
- [ ] Step 1, read path: `organisations.timezone` with a validating trigger, `weekStartOf(instant, tz)`,
  the eligibility window conversion, `timezone` on `Week`, seed and tests
- [ ] Step 2, write path: `PATCH /organisation`, column grant and Manager-only policy, settings control

### Docs housekeeping

- [x] Spell out DML in `okf/design/tenant-isolation-options.md`

### Users read policy

- [x] Restrict the organisation-wide `users` read to Managers (migration `0007`, RLS test, docs)
- [x] Fix the flaky seed fixture: the seed now takes `now` from the database clock
