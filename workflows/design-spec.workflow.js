// design-spec.workflow.js
//
// Fan-out spec design for the multi-tenant pulse-survey repo.
//
// Phase "Ground": three DeepSeek V4.1 Flash agents (agentType "grounder",
// thinking low) read the requirements, the OKF design notes, the layer's local
// skill and the pinned source under references/, in parallel. Each returns a
// structured grounding brief for one layer (database, backend, frontend).
//
// Phase "Author spec": one DeepSeek V4.1 Flash agent (agentType "architect",
// thinking max) turns the three briefs plus requirements.md into a short spec
// file.
//
// Phase "Review": a read-only code-reviewer agent (agentType "code-reviewer",
// Flash 4.1 at max thinking) checks the file against the hard invariants
// (tenant isolation, one response per active week enforced in the database,
// at most 3 questions, Manager vs Member roles) and feeds corrections back for
// a bounded revision.
//
// Routing map (see pi-config):
//   agentType "grounder"    -> deepseek-ai/DeepSeek-V4.1-Flash, thinking low
//   agentType "architect"   -> deepseek-ai/DeepSeek-V4.1-Flash, thinking max
//   agentType "code-reviewer" -> deepseek-ai/DeepSeek-V4.1-Flash, thinking max (read-only)
//
// Call the workflow tool with args (all optional):
//   { specPath: "okf/design/spec.md", layers: ["database","backend","frontend"],
//     decisions: ["extra settled decision to treat as binding"] }
//
// The decisions below are settled and binding. They come from ADR-0004, ADR-0005 and the
// four questions the human answered on 2026-09-26. The grounders must not list them as open,
// the architect must implement them, and the reviewer must check them.

export const meta = {
  name: 'design_spec',
  description:
    'Ground database, backend and frontend in parallel, then have DeepSeek V4.1 Flash author and review the project spec.',
  phases: [{ title: 'Ground' }, { title: 'Author spec' }, { title: 'Review' }],
};

const A = args && typeof args === 'object' ? args : {};
const specPath =
  typeof A.specPath === 'string' && A.specPath.trim().length > 0
    ? A.specPath.trim()
    : 'okf/design/spec.md';

const REQUESTED_LAYERS =
  Array.isArray(A.layers) && A.layers.length > 0
    ? A.layers.filter((l) => typeof l === 'string').slice(0, 3)
    : ['database', 'backend', 'frontend'];

// Settled decisions, binding on every agent in this run. Sources: ADR-0004, ADR-0005 and the
// four questions the human answered on 2026-09-26. Do not reopen these; implement them.
const SETTLED_DECISIONS = [
  "WEEK (ADR-0004): a week is an ISO 8601 calendar week in UTC, Monday 00:00:00 to Sunday 23:59:59.999. One pure server-side function weekStartOf(instant) = date_trunc('week', instant at time zone 'utc')::date, called by both submit and summary. responses.week_start date not null, UNIQUE (survey_id, user_id, week_start). The client never sends the week; a week_start in a request body is ignored. The form displays the week it is answering into.",
  'ISOLATION (ADR-0005): PostgreSQL row-level security declared in Drizzle with pgPolicy. Two roles: pulse_owner owns the schema and runs migrations and seed; pulse_app holds only DML grants and is what the API connects as. pulse_app owns no table, so no FORCE ROW LEVEL SECURITY is needed. One transaction per request sets app.current_org, app.current_user and app.current_role with set_config(name, value, true), and every query runs on that transaction handle, never on the pool. Application-layer org scoping stays as a second layer. Isolation tests connect as pulse_app, because a test connecting as the owner passes whether or not the policies are correct.',
  'MEMBER-LEVEL POLICY: on responses, a Member may select only their own rows and may insert only for themselves; a Manager may select every row in their own organisation. Policies read app.current_role as well as app.current_org.',
  'SESSION BOOTSTRAP: reading the sessions row happens before the tenant context exists. sessions carries a policy that shows a row only when its token hash equals app.current_session_token, set for that transaction from the cookie. The lookup is one query reading one row and cannot list the table. Sessions store a hash of the token, never the token itself.',
  "DEV DIRECTORY: the dev sign-in picker lists seeded users across organisations, which is a deliberate cross-tenant read recorded in ADR-0002. It is served by a SECURITY DEFINER function in a dev schema, owned by pulse_owner, granted to pulse_app, and called only when the dev flag is on. users stays org-scoped, so an ordinary request cannot read another organisation's users.",
  'SURVEY CREATION: a Manager-only POST /surveys endpoint with DTO validation, plus seeded surveys (one active survey per organisation with 3 questions). No create-survey screen in the React app: the UI keeps only the two flows requirements 5.1 and 5.2 name.',
  'THREE-QUESTION LIMIT: questions carries position smallint not null with CHECK (position between 1 and 3) and UNIQUE (survey_id, position), so a fourth question is unrepresentable rather than counted. No trigger, no racy count-then-insert.',
  'ANSWER SHAPE: answers(response_id, question_id, rating_value smallint null, yes_no_value boolean null) with CHECK (num_nonnulls(rating_value, yes_no_value) = 1) and CHECK (rating_value is null or rating_value between 1 and 5). Answer-to-question alignment is enforced by composite foreign keys: answers(survey_id, question_id) references questions(survey_id, id) and answers(survey_id, response_id) references responses(survey_id, id). Submit is all or nothing, with one answer per question of the survey; drafts are out of scope.',
  'SUMMARY MATHS: completion count = responses for that survey and week. Completion rate denominator = members of the organisation whose membership overlaps the week, so users carries joined_at timestamptz not null and deactivated_at timestamptz null, and the count is members with joined_at <= week end and (deactivated_at is null or deactivated_at >= week start). The rate is completed/eligible and can never exceed 1. Undefined ratios are JSON null, never NaN: rating average with no answers is null, and the rate with zero eligible members is null. Rating rollup returns average and count; yes/no returns a count per option. The summary module is the only code that counts or divides.',
  "STACK AND UI: client-only React 19 SPA, no server rendering, no framework router. Two screens (Member answers, Manager reads the summary) plus the dev user picker. Plain hand-written CSS with design tokens in one small stylesheet layer, no CSS framework and no component library. Playwright covers the core journeys end to end against the real API and the Compose database; the API's own tests use Vitest with supertest.",
  'PROCESS: the spec is written to okf/design/spec.md with OKF frontmatter (type, title, description, tags, generated) and no verified entry, because a human review is dated and comes later.',
];

const EXTRA_DECISIONS = Array.isArray(A.decisions)
  ? A.decisions.filter((d) => typeof d === 'string' && d.trim().length > 0)
  : [];

const DECISIONS = [...SETTLED_DECISIONS, ...EXTRA_DECISIONS];

const decisionBlock = (label) =>
  `${label}\n` + DECISIONS.map((d, i) => `${i + 1}. ${d}`).join('\n') + `\n`;

const LAYERS = [
  {
    id: 'database',
    skill: '.pi/skills/drizzle-reference/SKILL.md',
    sources:
      'references/drizzle-orm (the pinned Drizzle monorepo: orm, kit, zod, seed)',
    focus:
      'PostgreSQL schema and migrations: organisations, users, roles, sessions, surveys, questions, responses; the one-response-per-active-week rule enforced in the database; the row-level security policies, the two roles and the transaction-local tenant context decided in ADR-0005; seed data with two organisations and users per role, run as the owner role. Read okf/design/tenant-isolation-options.md and okf/adr/0005-rls-with-a-non-owner-app-role.md.',
  },
  {
    id: 'backend',
    skill: '.pi/skills/nestjs-reference/SKILL.md',
    sources: 'references/nest (the pinned NestJS source)',
    focus:
      'NestJS API surface: auth guard plus @Public(), and @CurrentUser()/@CurrentOrg() decorators from the server-side session; Manager-only survey create and manage; Member response submission; the summary maths (completion count, completion rate, rating average and count, yes/no counts); DTO validation; organisation always from the session, never the body or query. Read okf/design/multi-tenant-problem-space.md.',
  },
  {
    id: 'frontend',
    skill: '.pi/skills/react-reference/SKILL.md',
    sources:
      'references/react and references/react.dev (the pinned React sources)',
    focus:
      'Client-only SPA (no server rendering, no framework router): seeded user picker behind the dev flag; Member sees the active survey and submits a response; Manager sees the survey summary; data isolation between the two demo organisations. Read the client-side practices section of the skill.',
  },
];

const GROUND_SCHEMA = {
  type: 'object',
  properties: {
    layer: { type: 'string' },
    requirements: { type: 'array', items: { type: 'string' } },
    decisionsToSettle: { type: 'array', items: { type: 'string' } },
    patterns: { type: 'array', items: { type: 'string' } },
    specMustState: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'layer',
    'requirements',
    'decisionsToSettle',
    'patterns',
    'specMustState',
  ],
};

const AUTHOR_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    summary: { type: 'string' },
    sections: { type: 'array', items: { type: 'string' } },
    openDecisions: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'summary', 'sections'],
};

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    feedback: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'feedback'],
};

const layerFor = (id) => LAYERS.find((l) => l.id === id);

const groundPrompt = (layer) =>
  `You are grounding the ${layer.id} layer of this repo for a spec author. ` +
  `Work in the current working directory. Use ONLY the read and bash tools against local files. ` +
  `Do not use the network and do not write or edit anything.\n\n` +
  `Read, in this order:\n` +
  `1. requirements.md (the complete requirement set)\n` +
  `2. TODO.md and the "## 1. Design choices" section of SOLUTION.md (decisions so far)\n` +
  `3. okf/design/multi-tenant-problem-space.md and okf/design/tenant-isolation-options.md\n` +
  `4. okf/adr/0004-calendar-week-in-utc.md and okf/adr/0005-rls-with-a-non-owner-app-role.md (the two decisions that are already settled)\n` +
  `5. ${layer.skill} (the verified ${layer.id} patterns for this repo; it lists exact paths into the pinned source)\n` +
  `6. ${layer.sources}, reading the exact files the skill cites for the patterns you mention\n\n` +
  `Focus: ${layer.focus}\n\n` +
  `Produce a grounding brief for the ${layer.id} layer only. For every pattern you recommend, cite the file path you read it in. ` +
  `List: requirements that touch this layer; decisions this layer still has to settle (the list below is settled, so do not raise those again); ` +
  `concrete patterns to use, each with a file path; exactly what the spec must state for this layer; ` +
  `and risks or gotchas (for example version differences between the pin and current docs).\n\n` +
  decisionBlock(
    'Settled decisions, binding, already recorded in ADR-0004 and ADR-0005:',
  );

const authorPrompt = (feedback, briefs) =>
  `You are writing the project spec. Work in the current working directory with the read, write, edit and bash tools.\n\n` +
  (feedback
    ? `Your previous draft was rejected. Address every point in this review feedback before writing the file:\n${feedback}\n\n`
    : '') +
  `Grounding briefs from three parallel layer agents (database, backend, frontend):\n` +
  `${JSON.stringify(briefs, null, 2)}\n\n` +
  `Now write the spec file to ${specPath}. The spec must be short and concrete enough for an implementer to follow. It must cover:\n` +
  `1. Domain model: tables, columns, types, unique constraints, indexes, the one-response-per-active-week rule and where it is enforced (the database).\n` +
  `2. Tenant isolation: the chosen mechanism and the top rule that the organisation always comes from the authenticated user's server-side session, never from a request body or query string.\n` +
  `3. API surface: endpoints, methods, DTO shapes, who may call each one (Manager vs Member), and the summary maths (completion count, completion rate, rating average and count, yes/no counts).\n` +
  `4. Frontend: the client-only SPA screens and flows, the dev-only seeded user picker behind the flag that defaults off and refuses to start in production, and how the two-organisation demo proves isolation.\n` +
  `5. CSS plan: the token set, the file layout and the small number of components, with no framework.\n` +
  `6. Repository layout: the files to create under apps/api and apps/web, and the npm scripts.\n` +
  `7. Test plan: the RLS test that connects as pulse_app, the isolation tests through a real session, the one-response-per-week test, the summary maths tests, the week function tests, the dev-flag-off 404 tests, and the Playwright journeys.\n` +
  `8. Open decisions: list anything still to be decided as an ADR, with a recommendation. Settled decisions are not open.\n\n` +
  decisionBlock(
    'Settled decisions. These are binding: implement them and do not reopen them.',
  ) +
  `\nWrite the file with OKF frontmatter: type, title, description, tags and a generated entry naming you as deepseek-ai/DeepSeek-V4.1-Flash. Do not add a verified entry; a human review is dated and comes later. Link ADR-0004 and ADR-0005 by bundle-relative path where they apply, since okf:validate fails on a link that does not resolve.\n\n` +
  `Keep it brief. Do not implement anything. Return the path you wrote, a one-paragraph summary, the section list, and any open decisions.`;

const reviewPrompt = () =>
  `Review the spec file at ${specPath} in the current working directory, using read and bash only. ` +
  `Check it against requirements.md and the hard project constraints:\n` +
  `1. Tenant isolation: the spec states that the organisation always comes from the authenticated user's session and never from the body or query string.\n` +
  `2. One response per active week: enforced in the database (a unique constraint or equivalent), not only in code.\n` +
  `3. A survey has at most 3 questions, of types rating 1-5 and yes/no.\n` +
  `4. Managers create and manage surveys in their own organisation only; Members submit one response per active week per survey.\n` +
  `5. The spec names the summary maths: completion count, completion rate (responses over organisation members), rating average and count, yes/no counts.\n` +
  `6. The frontend is a client-only SPA; the seeded user picker is dev-only, defaults off, and refuses to start in production.\n` +
  `7. The spec is brief and implementable; no invented framework APIs.\n` +
  `8. Every settled decision below appears in the spec as stated, with nothing invented around it and nothing reopened.\n` +
  `9. The spec names the RLS test as connecting to the database as pulse_app, not as the owner, and it states that queries run on the transaction handle.\n` +
  `10. The spec's frontmatter carries generated and no verified entry.\n` +
  `11. Run \`npm run okf:validate\` and report the issue count. Any issue caused by the spec file is a failure.\n\n` +
  decisionBlock('Settled decisions, all of which must appear in the spec:') +
  `\nReturn ok=true only when every point is satisfied. Otherwise return ok=false and list each unmet point in feedback with a concrete fix.`;

// 1. Ground: fan out one Flash 4.1 read-only agent per layer.
phase('Ground');
log(`Fanning out grounding for: ${REQUESTED_LAYERS.join(', ')}`);
const groundRaw = await parallel(
  REQUESTED_LAYERS.map((id, index) => () => {
    const layer = layerFor(id);
    if (!layer) {
      return agent(`Unknown layer "${id}". Return an empty brief for it.`, {
        agentType: 'grounder',
        label: `ground:${index}:unknown`,
        schema: GROUND_SCHEMA,
      });
    }
    return agent(groundPrompt(layer), {
      agentType: 'grounder',
      label: `ground:${index}:${id}`,
      schema: GROUND_SCHEMA,
    });
  }),
);

// Keep every intended identity before using the results.
const grounding = REQUESTED_LAYERS.map((id, index) => ({
  id,
  status: groundRaw[index] === null ? 'failed' : 'complete',
  brief: groundRaw[index],
}));

// 2. Author + 3. Review: bounded author/review loop (max 3 attempts).
const attempts = [];
let specDraft = null;
let review = null;
let attempt = 0;
const MAX_ATTEMPTS = 3;

while (attempt < MAX_ATTEMPTS) {
  attempt += 1;
  phase('Author spec');
  log(`Authoring the spec (attempt ${attempt} of ${MAX_ATTEMPTS})`);
  specDraft = await agent(
    authorPrompt(review === null ? undefined : review.feedback, grounding),
    {
      agentType: 'architect',
      label: `author-spec:${attempt}`,
      schema: AUTHOR_SCHEMA,
    },
  );

  phase('Review');
  log(`Reviewing the spec (attempt ${attempt} of ${MAX_ATTEMPTS})`);
  review = await agent(reviewPrompt(), {
    agentType: 'code-reviewer',
    label: `review-spec:${attempt}`,
    schema: REVIEW_SCHEMA,
  });
  attempts.push({ attempt, draft: specDraft, review });
  if (review !== null && review.ok === true) break;
}

const ok = specDraft !== null && review !== null && review.ok === true;

return {
  ok,
  specPath,
  layers: REQUESTED_LAYERS,
  grounding,
  attempts,
  attemptsUsed: attempt,
  summary: ok
    ? `Spec written to ${specPath} and passed review after ${attempt} attempt(s).`
    : `Spec gate exhausted after ${attempt} attempt(s); the spec at ${specPath} still needs manual review.`,
};
