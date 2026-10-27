// implement-slices.workflow.js
//
// Implement the project in vertical slices: DeepSeek V4.1 Flash (max) thinks,
// DeepSeek V4.1 Flash (low) implements and tests, DeepSeek V4.1 Flash (max)
// reviews. Each slice covers a full vertical path so the app is runnable end to
// end after each piece lands.
//
// Phases:
//   "Contract"     the architect (Flash 4.1, max) pins the shared contract
//                  (tables, endpoints, field names) into okf/design/contract.md,
//                  so every later slice works from one fixed shape.
//   "Slices"       for each slice, in order: think (max) -> implement (low) ->
//                  review and test in parallel -> bounded fix loop.
//   "Final verify" the full suite and a spec-conformance review, in parallel.
//   "Handoff"      the visual browser pass, which the orchestrator runs.
//
// Routing map (see pi-config):
//   agentType "architect"     -> deepseek-ai/DeepSeek-V4.1-Flash, thinking max
//   agentType "implementer"   -> deepseek-ai/DeepSeek-V4.1-Flash, thinking low
//   agentType "code-reviewer" -> deepseek-ai/DeepSeek-V4.1-Flash, thinking max (read-only)
//
// Why the browser pass is a handoff and not a subagent: workflow subagents only
// get the coding tools (read/write/edit/bash), not the host browser tools. The
// orchestrator (the main agent, which is multimodal) performs the visual pass
// with agent_browser after this workflow returns.
//
// Resilience: every agent call carries retries: 2 for recoverable transport
// failures, and a null result from think or implement is retried once by
// re-issuing the same prompt. If a slice still fails it is recorded and the run
// continues, so one bad slice does not throw away the rest. To recover a failed
// slice without paying for the completed ones again, edit this script and call
// the workflow tool with resumeFromRunId: unchanged agent() calls replay from
// the run cache, because calls match by position.
//
// Call the workflow tool with args (all optional):
//   {
//     specPath: "okf/design/spec.md",
//     contractPath: "okf/design/contract.md",
//     maxFixRounds: 2,
//     slices: [ { id, name, scope, acceptance, contracts, verify: [cmd, ...] }, ... ]
//   }
// Omit slices to run the build order in okf/design/spec.md below.

export const meta = {
  name: 'implement_slices',
  description:
    'Implement okf/design/spec.md in vertical slices: Flash 4.1 (max) plans, Flash 4.1 (low) implements and tests, Flash 4.1 (max) reviews, then a visual handoff.',
  phases: [
    { title: 'Contract' },
    { title: 'Slices' },
    { title: 'Final verify' },
    { title: 'Handoff' },
  ],
};

const A = args && typeof args === 'object' ? args : {};

const str = (value, fallback) =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
const int = (value, fallback, min, max) =>
  Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;

const specPath = str(A.specPath, 'okf/design/spec.md');
const contractPath = str(A.contractPath, 'okf/design/contract.md');
const maxFixRounds = int(A.maxFixRounds, 2, 0, 3);

// The build order in okf/design/spec.md, one slice per step, plus the docs step.
const DEFAULT_SLICES = [
  {
    id: 'db-foundation',
    name: 'Database roles, schema, policies, migrations and seed',
    contracts: [
      'okf/pulse-surveys/domain-model.md',
      'okf/pulse-surveys/architecture.md',
    ],
    scope:
      'apps/api/db/bootstrap.sql (pulse_owner and pulse_app with the flags the ADR names, ALTER DATABASE pulse OWNER TO pulse_owner, pulse_test owned by pulse_owner, idempotent, passwords taken from the psql variables owner_password and app_password which the root db:bootstrap script passes from .env); apps/api/drizzle.config.ts (schema, out, dialect, casing, DATABASE_URL_OWNER, and it loads the repo-root .env itself with process.loadEnvFile); src/db/schema.ts with the seven tables, every named constraint and index, pgRole(...).existing(), enableRLS() and the eight policies, exactly as the contract lists them; src/db/tenant-settings.ts with the four app.current_* fragments and their uuid casts; the three migrations (0000_init generated, 0001_grants custom, 0002_dev_schema custom with schema dev, dev.list_users(), dev.create_session(...) and the grants); src/surveys/week.ts (weekStartOf, the SQL fragment, isWeekStart, weekLabel); src/db/fixtures.ts, seed.ts and seed-cli.ts, safe to re-run; test/global-setup.ts which drops and recreates public, dev and drizzle in pulse_test, then migrates and seeds, wired into both vitest configs; test/rls.spec.ts and test/week.spec.ts.',
    acceptance:
      'npm run db:reset leaves two organisations with seeded surveys and a non-empty current week; test/rls.spec.ts connects as pulse_app and fails when a policy is dropped from the schema.',
    verify: ['npm run db:reset', 'npm run typecheck', 'npm test'],
  },
  {
    id: 'tenant-plumbing',
    name: 'Config invariants, tenant transaction, auth guard and dev sign-in',
    contracts: [
      'okf/pulse-surveys/architecture.md',
      'okf/pulse-surveys/api.md',
    ],
    scope:
      'src/config.ts (loads the repo-root .env, parses the environment with Zod, and enforces the four startup invariants, including refusing AUTH_MODE=dev with NODE_ENV=production); src/db/db.module.ts (the pulse_app pool and the Drizzle instance); src/common/tenant-transaction.interceptor.ts and src/common/http-exception.filter.ts; src/auth/auth.module.ts, auth.guard.ts, roles.guard.ts, decorators.ts (@Public, @Roles, @CurrentUser, @CurrentOrg, @CurrentTx) and sessions.service.ts; src/dev/dev.controller.ts and dev.service.ts (404 when AUTH_MODE is off); src/app.module.ts wiring the guards, the Zod APP_PIPE and the filter, and src/main.ts setting the api prefix, the cookie and API_PORT; GET /api/health, GET /api/me and DELETE /api/sessions; test/auth.e2e-spec.ts and test/dev-gate.e2e-spec.ts.',
    acceptance:
      'A request with no cookie, a tampered token, an expired session and a deactivated user are each 401; logout deletes the row; a Manager route with a Member session is 403; the dev routes are 404 with AUTH_MODE=off; the API refuses to start when the two connection strings are equal or the app role can bypass RLS.',
    verify: ['npm run typecheck', 'npm test', 'npm run test:e2e'],
  },
  {
    id: 'surveys-api',
    name: 'Survey create, archive, list and active endpoints',
    contracts: [
      'okf/pulse-surveys/api.md',
      'okf/pulse-surveys/architecture.md',
    ],
    scope:
      'src/surveys/surveys.controller.ts, surveys.service.ts, surveys.repository.ts and dto/ (Zod schemas attached per parameter with @Body({ schema }) and @Query({ schema })); GET /api/surveys/active for a Member, GET /api/surveys, POST /api/surveys and PATCH /api/surveys/:id for a Manager; the repository takes the organisation from the session as a required argument; test/surveys.e2e-spec.ts and the survey half of test/isolation.e2e-spec.ts.',
    acceptance:
      "A Manager creates a survey with its questions; four questions, an unknown type and an over-long title are each 400; a Member is 403; a second active survey is 409; PATCH archives; another organisation's id is 404, never 403.",
    verify: ['npm run typecheck', 'npm test', 'npm run test:e2e'],
  },
  {
    id: 'responses-summary-api',
    name: 'Response submission and the weekly summary',
    contracts: [
      'okf/pulse-surveys/api.md',
      'okf/pulse-surveys/domain-model.md',
    ],
    scope:
      'POST /api/surveys/:id/responses for a Member (one answer per question, all or nothing in one transaction, 409 on a duplicate week or an archived survey, 400 on a type mismatch or an incomplete set); GET /api/surveys/:id/summary for a Manager with an optional Monday weekStart; src/surveys/summary.math.ts as the only module that counts or divides and summary.service.ts for the SQL; test/submit.e2e-spec.ts, test/summary.e2e-spec.ts, test/summary-maths.spec.ts and the remaining cases in test/isolation.e2e-spec.ts.',
    acceptance:
      'The first submit is 201 and a second in the same week is 409 with exactly one row in the database; the summary returns the completion count, the rate over the members whose membership overlaps the week, the rating average and count, and the yes/no counts; a zero-response week returns zero counts and null averages, never NaN.',
    verify: ['npm run typecheck', 'npm test', 'npm run test:e2e'],
  },
  {
    id: 'web-member-flow',
    name: 'Member survey flow in React',
    contracts: ['okf/pulse-surveys/frontend.md', 'okf/pulse-surveys/api.md'],
    scope:
      "apps/web: src/api/types.ts, client.ts and parsers.ts (hand-written guards, parsed once); src/session/SessionProvider.tsx (the only Context); src/screens/SignInScreen.tsx (the picker grouped by organisation, and the disabled state) and MemberScreen.tsx (the server's week label, one field per question, useActionState with the submitted, duplicate, invalid and error outcomes); src/components/ErrorBoundary.tsx and QuestionField.tsx; src/styles/tokens.css and app.css; App.tsx deriving the five states in render; vite.config.ts proxying /api to the API port; delete src/App.css, src/assets/ and the template smoke test; component tests for the picker, the member screen, the 409 and 400 paths and the error boundary.",
    acceptance:
      'Typecheck and the web component tests pass; the member flow is covered by a component test; no server rendering, no router, no data library and no `use client` or `use server`.',
    verify: ['npm run typecheck', 'npm test'],
  },
  {
    id: 'web-manager-flow',
    name: 'Manager summary flow in React',
    contracts: ['okf/pulse-surveys/frontend.md', 'okf/pulse-surveys/api.md'],
    scope:
      'apps/web: src/screens/ManagerScreen.tsx (the survey list, then the summary of the selected survey), src/components/SummaryPanel.tsx, the summary types and parsers, and component tests proving the rate renders as a percentage, a null rate renders as text, a null average renders as text, and NaN never reaches the DOM.',
    acceptance:
      'Typecheck and the web component tests pass; the summary rendering is covered by a component test; the client never divides.',
    verify: ['npm run typecheck', 'npm test'],
  },
  {
    id: 'playwright-e2e',
    name: 'Playwright two-organisation isolation demo',
    contracts: [
      'okf/pulse-surveys/frontend.md',
      'okf/pulse-surveys/architecture.md',
    ],
    scope:
      'apps/web/e2e/playwright.config.ts with two webServer entries (the API with AUTH_MODE=dev, and the Vite dev server), a Chromium project and screenshots; apps/web/e2e/journeys.spec.ts walking the three journeys in the front end concept, including a Member submitting, the duplicate 409, the Manager reading the summary, and a cross-organisation request answered with 404; screenshots under apps/web/e2e/screenshots/. Run npx playwright install chromium if the browser is missing.',
    acceptance:
      'npm run test:e2e:web passes against the seeded stack and asserts the isolation behaviour, not just that pages load.',
    verify: ['npm run typecheck', 'npm test', 'npm run test:e2e:web'],
  },
  {
    id: 'delivery-docs',
    name: 'README run steps and the AWS production design note',
    contracts: ['okf/design/spec.md', 'okf/pulse-surveys/architecture.md'],
    scope:
      "README.md: prerequisites, db:reset, dev:api, dev:web, AUTH_MODE=dev, every test command, and the docs map. okf/design/aws-production-note.md: the design-only answer to requirement 6 (how the app, the database and the static front end would be deployed on AWS; how an organisation logo would be stored and served so backend bandwidth and cost stay low while access stays secure, for example object storage with short-lived signed URLs or a CDN in front of private objects; and the tenancy, security and scaling points to handle first), written against this codebase's real choices, so it names row-level security with a non-owner role, server-side sessions and the dev-only sign-in gap. Front matter per okf-concept-template.md.",
    acceptance:
      'README steps match the scripts that exist; the note answers all three points of requirement 6 and invents no infrastructure the repo does not have; npm run okf:validate reports 0 issues.',
    verify: ['npm run okf:validate'],
  },
];

const slices =
  Array.isArray(A.slices) && A.slices.length > 0 ? A.slices : DEFAULT_SLICES;

const COMMON =
  `Repo facts:\n` +
  `- Workspace root: npm workspaces with apps/api (NestJS 12, ESM with "type": "module", moduleResolution nodenext, so relative imports need the .js extension, TypeScript 6 strict, Vitest, oxlint) and apps/web (React 19.3.0, Vite, Vitest + Testing Library, React Compiler).\n` +
  `- Environment is ready: dependencies are installed (drizzle-orm 0.45.3, drizzle-kit 0.31.11, pg, zod 4.6.5, tsx, @types/pg in apps/api), .env exists at the repo root, PostgreSQL 18.6 runs in Docker Compose (npm run db:up).\n` +
  `- Commands: npm run typecheck, npm test (API unit plus web component tests; it brings the database up and runs db:bootstrap first), npm run test:e2e (API e2e against pulse_test as pulse_app), npm run test:e2e:web (db:reset then Playwright), npm run lint, npm run db:reset, npm run db:bootstrap, npm run db:generate, npm run db:migrate, npm run db:seed, npm run db:psql, npm run okf:validate.\n` +
  `- Local skills, read the matching one before writing framework code: .pi/skills/drizzle-reference/SKILL.md, .pi/skills/nestjs-reference/SKILL.md, .pi/skills/react-reference/SKILL.md. Pinned read-only source under references/.\n` +
  `- Binding documents: ${specPath} (build order, rules, definition of done), the contract at ${contractPath}, and the four concepts it pins: okf/pulse-surveys/domain-model.md, architecture.md, api.md, frontend.md. The ADRs in okf/adr/ carry the reasoning.\n` +
  `- Hard rules: tenant isolation is the top rule, and the organisation always comes from the authenticated user's server-side session, never from a body, query string or route parameter. One response per active week per survey, enforced in the database. At most 3 questions (rating 1 to 5, yes/no). TypeScript strict, no any without a comment. The front end is a client-only SPA.\n` +
  `- Traps already known, do not rediscover them: drizzle-kit imports dotenv/config, which loads .env from the cwd (apps/api when run through a workspace script), so drizzle.config.ts and src/config.ts must load the repo-root .env themselves with process.loadEnvFile and tolerate its absence. drizzle-kit push is banned. Never edit an applied migration. test/rls.spec.ts is an integration test included by the unit config, so the test-database global setup must be wired into both vitest configs. The cookie is read by parsing the Cookie header by hand: cookie-parser is not a dependency and must not be added. Nest's cookie maxAge is in seconds.`;

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    tests: { type: 'array', items: { type: 'string' } },
    commands: { type: 'array', items: { type: 'string' } },
    contracts: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['plan', 'files', 'tests', 'commands'],
};

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    filesTouched: { type: 'array', items: { type: 'string' } },
    commandsRun: { type: 'array', items: { type: 'string' } },
    commandOutput: { type: 'string' },
    selfCheck: { type: 'string' },
    blockers: { type: 'string' },
  },
  required: ['filesTouched', 'commandsRun', 'selfCheck'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blocking: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'blocking'],
};

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    ran: { type: 'array', items: { type: 'string' } },
    failures: { type: 'string' },
  },
  required: ['ok', 'failures'],
};

const CONTRACT_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    summary: { type: 'string' },
    pinned: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'summary', 'pinned'],
};

const RETRIES = 2;

const contractPrompt = () =>
  `${COMMON}\n` +
  `Read ${specPath} and the four concepts it points at (okf/pulse-surveys/domain-model.md, architecture.md, api.md, frontend.md), then the current repo state (git status, the apps/api and apps/web trees, package.json scripts, .env.example). ` +
  `Write a short contract file to ${contractPath} that pins, verbatim and unambiguously:\n` +
  `1. Every table and column name, type, constraint, index and policy, plus the two database roles.\n` +
  `2. Every HTTP endpoint: method, path, request body or query shape, response shape, and which role may call it.\n` +
  `3. The field names the front end consumes, exactly as the API returns them, including the summary shape and its null cases.\n` +
  `4. The environment variables and the root npm scripts.\n\n` +
  `The contract exists so later slices cannot drift, and it is the first thing every later agent reads. Copy names and shapes from the concepts; do not invent and do not implement anything. If a concept contradicts itself, say so in the summary. Return the path, a one-line summary, and the pinned list.`;

const thinkPrompt = (slice, contract) =>
  `${COMMON}\n` +
  `You are planning one vertical slice. Read ${specPath}, the concepts listed for this slice (${slice.contracts.join(', ')}), the contract at ${contractPath}, and the current repo state (git status, git log -3, the files the previous slices touched).\n` +
  `Contract pinned in the contract phase:\n${JSON.stringify(contract, null, 2)}\n\n` +
  `Slice: ${slice.id}: ${slice.name}\n` +
  `Scope: ${slice.scope}\n` +
  `Acceptance: ${slice.acceptance}\n` +
  `Verify commands for this slice: ${JSON.stringify(slice.verify)}\n\n` +
  `Read the current repo state before planning. Produce a precise implementation plan: the exact files to create or edit, the tests to add, the commands to run, the contract points this slice must honour, and any decision the implementer must not improvise. Keep it minimal and concrete. Do not write code.`;

const implementPrompt = (slice, plan, contract) =>
  `${COMMON}\n` +
  `Implement the slice below exactly as planned. Read the matching local skill and, when a framework API is uncertain, the pinned source under references/ before writing it.\n\n` +
  `Slice: ${slice.id}: ${slice.name}\n` +
  `Scope: ${slice.scope}\n` +
  `Acceptance: ${slice.acceptance}\n` +
  `Plan:\n${JSON.stringify(plan, null, 2)}\n` +
  `Contract:\n${JSON.stringify(contract, null, 2)}\n\n` +
  `Write the code and the tests, then run these commands and report their output honestly: ${JSON.stringify(slice.verify)}. ` +
  `If a command fails because a later slice has not landed yet, say so explicitly rather than hiding it. ` +
  `Report every file you touched, every command you ran, the tail of the command output, and a short self-check.`;

const reviewPrompt = (slice, impl) => {
  const files =
    impl && Array.isArray(impl.filesTouched) ? impl.filesTouched : [];
  return (
    `${COMMON}\n` +
    `Review the work for the slice below. You are read-only: use read and bash, never write or edit.\n\n` +
    `Slice: ${slice.id}: ${slice.name}\n` +
    `Scope: ${slice.scope}\n` +
    `Acceptance: ${slice.acceptance}\n` +
    `Files the implementer touched:\n${files.length ? files.join('\n') : '(none reported, review git status and the diff instead)'}\n\n` +
    `Read the diff (git status, git diff) and the files. Check tenant isolation (the organisation always from the session, never from a body or query string), the one-response-per-week database enforcement, validation at the API edge, the role checks, the summary maths, the database role and policy split, and any invented framework API. ` +
    `Verify each acceptance claim by reading the code and the tests, not by trusting the implementer's summary. Distinguish blocking issues from nits. Return ok=true only when there are no blocking issues.`
  );
};

const testPrompt = (slice) =>
  `${COMMON}\n` +
  `Run the verification commands for the slice below. Do not edit any file, and do not fix anything: only run the commands and report what happened.\n\n` +
  `Slice: ${slice.id}: ${slice.name}\n` +
  `Commands: ${JSON.stringify(slice.verify)}\n\n` +
  `Run each command in order from the repo root, capture the tail of the output, and return ok=true only if every command passed. ` +
  `If a command failed, put the failure output in the failures field, and say whether the failure belongs to this slice or to a slice that has not landed yet.`;

const fixPrompt = (slice, review, test, impl) =>
  `${COMMON}\n` +
  `Fix the slice below. Apply the reviewer's blocking issues and make the failing commands pass with the smallest correct change.\n\n` +
  `Slice: ${slice.id}: ${slice.name}\n` +
  `Acceptance: ${slice.acceptance}\n` +
  `Review findings:\n${JSON.stringify(review, null, 2)}\n` +
  `Test result:\n${JSON.stringify(test, null, 2)}\n` +
  `What the implementer reported:\n${JSON.stringify(impl, null, 2)}\n\n` +
  `Edit only what is needed to clear the blocking issues and the failures, then re-run: ${JSON.stringify(slice.verify)}. ` +
  `Report every file you changed and the final command output.`;

const finalTestPrompt = () =>
  `${COMMON}\n` +
  `Run the full local verification, in this order: npm run db:reset, npm run typecheck, npm run lint, npm test, npm run test:e2e, npm run test:e2e:web, npm run okf:validate. ` +
  `Do not edit files. Report ok=true only if every command passes, else the failures, with the tail of the output for each failure.`;

const conformancePrompt = () =>
  `${COMMON}\n` +
  `Final read-only conformance review against ${specPath} and the four concepts in okf/pulse-surveys/. Use read and bash. Verify by inspecting the code and the tests:\n` +
  `1. Tenant isolation holds on every query, endpoint and UI path: the organisation comes from the session, never from a body or query string, and another organisation's id is a 404.\n` +
  `2. The one-response-per-active-week rule is enforced in the database and covered by a test.\n` +
  `3. The summary maths (completion count, completion rate over the members whose membership overlaps the week, rating average and count, yes/no counts) is implemented and tested, including the empty week.\n` +
  `4. Manager and Member role boundaries are enforced and tested.\n` +
  `5. The front end is a client-only SPA, and the dev-only seeded user picker is behind the flag, off by default, and refused in production.\n` +
  `6. Every command in the definition of done exists in package.json and is exercised by a test that proves the claim rather than merely running.\n\n` +
  `Return ok=true only when every point is satisfied, else list each unmet point as a blocking item with the file and line that proves it.`;

// 1. Contract: one architect agent (Flash 4.1, max) pins the shared shape.
phase('Contract');
log('Pinning the shared contract');
const contract = await retry(
  () =>
    agent(contractPrompt(), {
      agentType: 'architect',
      label: 'contract',
      schema: CONTRACT_SCHEMA,
      retries: RETRIES,
    }),
  { attempts: 2 },
);

// 2. Slices: sequential vertical pieces, each depending on the previous, with a
//    fan-out at the review and test step inside every slice.
phase('Slices');
const sliceLedger = [];

for (const slice of slices) {
  const entry = { id: slice.id, name: slice.name };
  log(`Slice ${slice.id}: think`);

  const plan = await retry(
    () =>
      agent(thinkPrompt(slice, contract), {
        agentType: 'architect',
        label: `think:${slice.id}`,
        schema: PLAN_SCHEMA,
        retries: RETRIES,
      }),
    { attempts: 2 },
  );
  if (plan === null) {
    entry.status = 'failed';
    entry.stage = 'think';
    sliceLedger.push(entry);
    log(`Slice ${slice.id}: think failed, skipping the slice`);
    continue;
  }
  entry.plan = plan;

  log(`Slice ${slice.id}: implement`);
  const impl = await retry(
    () =>
      agent(implementPrompt(slice, plan, contract), {
        agentType: 'implementer',
        label: `implement:${slice.id}`,
        schema: IMPL_SCHEMA,
        retries: RETRIES,
      }),
    { attempts: 2 },
  );
  if (impl === null) {
    entry.status = 'failed';
    entry.stage = 'implement';
    sliceLedger.push(entry);
    log(`Slice ${slice.id}: implement failed, skipping the slice`);
    continue;
  }
  entry.impl = impl;

  log(`Slice ${slice.id}: review and test in parallel`);
  let review = null;
  let test = null;
  let fixCount = 0;
  const rounds = [];
  for (;;) {
    const roundLabel = fixCount + 1;
    [review, test] = await parallel([
      () =>
        agent(reviewPrompt(slice, impl), {
          agentType: 'code-reviewer',
          label: `review:${slice.id}:${roundLabel}`,
          schema: REVIEW_SCHEMA,
          retries: RETRIES,
        }),
      () =>
        agent(testPrompt(slice), {
          agentType: 'implementer',
          label: `test:${slice.id}:${roundLabel}`,
          schema: TEST_SCHEMA,
          retries: RETRIES,
        }),
    ]);
    rounds.push({ round: roundLabel, review, test });

    const done =
      review !== null &&
      review.ok === true &&
      test !== null &&
      test.ok === true;
    if (done || fixCount >= maxFixRounds) break;

    fixCount += 1;
    log(`Slice ${slice.id}: fix round ${fixCount}`);
    const fixed = await retry(
      () =>
        agent(fixPrompt(slice, review, test, impl), {
          agentType: 'implementer',
          label: `fix:${slice.id}:${fixCount}`,
          schema: IMPL_SCHEMA,
          retries: RETRIES,
        }),
      { attempts: 2 },
    );
    if (fixed === null) break;
  }

  entry.status =
    review !== null && review.ok === true && test !== null && test.ok === true
      ? 'complete'
      : 'needs-attention';
  entry.fixRounds = fixCount;
  entry.rounds = rounds;
  sliceLedger.push(entry);
  log(`Slice ${slice.id}: ${entry.status}`);
}

// 3. Final verify: the full suite and the conformance review, in parallel.
phase('Final verify');
log('Running the full suite and the conformance review');
const [finalTest, conformance] = await parallel([
  () =>
    agent(finalTestPrompt(), {
      agentType: 'implementer',
      label: 'final-test',
      schema: TEST_SCHEMA,
      retries: RETRIES,
    }),
  () =>
    agent(conformancePrompt(), {
      agentType: 'code-reviewer',
      label: 'conformance-review',
      schema: REVIEW_SCHEMA,
      retries: RETRIES,
    }),
]);

// 4. Handoff: computed in the script, no agent. Workflow subagents cannot use the
//    browser tools, so the multimodal orchestrator does the visual pass.
phase('Handoff');
const handoff = {
  why: 'Workflow subagents only receive the coding tools (read/write/edit/bash), not the host browser tools. The visual pass therefore runs in the orchestrator.',
  steps: [
    'Run npm run db:reset, then npm run dev:api and npm run dev:web in separate terminals, with AUTH_MODE=dev in .env.',
    'Open the app with agent_browser, sign in as the org A Manager and confirm the summary screen renders the seeded data.',
    'Sign in as the org A Member and submit a response, then reload the Manager view and confirm the summary updated.',
    "Sign in as the org B Member and confirm org A's survey and summary are not visible.",
    'Read the Playwright screenshots under apps/web/e2e/screenshots/ and judge the UI.',
    'Fix any UI or functionality issue with the implementer (or directly) and re-verify.',
  ],
};

const allSlicesComplete = sliceLedger.every((s) => s.status === 'complete');

return {
  ok:
    allSlicesComplete &&
    finalTest !== null &&
    finalTest.ok === true &&
    conformance !== null &&
    conformance.ok === true,
  specPath,
  contractPath,
  contract,
  slices: sliceLedger.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    stage: s.stage,
    fixRounds: s.fixRounds,
    blocking: (s.rounds || []).flatMap((r) =>
      r.review && Array.isArray(r.review.blocking) ? r.review.blocking : [],
    ),
    failures: (s.rounds || []).map((r) =>
      r.test ? r.test.failures : '(test agent returned null)',
    ),
  })),
  final: { test: finalTest, conformance },
  handoff,
  summary:
    `Implemented ${sliceLedger.filter((s) => s.status === 'complete').length} of ${slices.length} slice(s); ` +
    `final test ${finalTest && finalTest.ok ? 'passed' : 'needs attention'}; conformance ${conformance && conformance.ok ? 'passed' : 'needs attention'}. ` +
    `See handoff for the visual browser pass.`,
};
