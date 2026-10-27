---
type: Architecture
title: "Front end: the two React flows and the CSS plan"
description: "The five screen states of the client-only SPA, the Member form, the Manager summary, the two-organisation demo and the hand-written CSS layer."
tags: [react, spa, css, frontend]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-26 }
sources:
  - resource: okf/design/spec.md
    title: The plan of record this concept was split out of
  - resource: .pi/skills/react-reference/SKILL.md
    title: The client-side React 19 practices this app follows
---

# Front end

`apps/web` is a client-only React 19.3 SPA built with Vite, talking to the API over HTTP. No router,
no data library, no component library, no server rendering, no `use client` or `use server`. Vite
proxies `/api` to `http://127.0.0.1:3000`, so every call is same-origin, the cookie is first-party,
and no CORS is configured.

`App` derives one of five states in render, from the session state and nothing else. There is no URL
for a screen, and the organisation never appears in a query string.

| State | Screen | What it does |
| --- | --- | --- |
| bootstrap | `App` | `GET /api/me` on mount, with an abort/ignore cleanup, because StrictMode double-invokes effects |
| signed out, `devSignIn: true` | `SignInScreen` | `GET /api/dev/users`, users grouped by organisation with a role badge; picking one posts `/api/dev/sessions` |
| signed out, `devSignIn: false` | `SignInScreen` (disabled) | "Sign-in is disabled in this environment", because `/api/dev/users` returns `404` |
| `role: 'member'` | `MemberScreen` | the active survey, the week label from the server, one field per question, submit; an empty state when `survey` is null |
| `role: 'manager'` | `ManagerScreen` | the survey list, then the summary for the selected survey |

- **Session state** lives in one Context provider (`SessionProvider` and its `session-context.ts`
hook, split so the provider file exports only a component), the only thing the skill
  allows Context for. It exposes `signIn(userId)`, `signOut()` and the session value; every other
  value is derived in render, not synced by an effect.
- **The Member form** uses `<form action={submitAction}>` with `useActionState` and `useFormStatus`,
  and the action returns `{ kind: 'submitted' | 'duplicate' | 'invalid' | 'error', message? }`. A
  `409` renders "You have already answered this week" next to the form, a `400` renders the message,
  and a network failure renders a retry. The form stays enabled when the API says on load that the
  Member already answered: the database decides, and the `409` path stays visible in the demo. Once
  a submit in this visit is answered (recorded or `409`), the form is disabled, because that outcome
  is newer than the flag read on load.
- **The Manager summary** renders the completion count, the rate as a percentage, and per question
  the rating average with its count or the yes/no counts. A null rate renders as "no eligible
  members" and a null average as "no answers yet", never `0` or `NaN`; the client never divides.
- **API responses are parsed once** in `src/api/parsers.ts` with the API's own Zod schemas from
  `@pulse/contracts`, so a malformed payload fails at the app edge rather than becoming `undefined`
  in a render, and the types cannot drift from the server's. An earlier version mirrored the types
  by hand; [ADR-0008](/adr/0008-shared-contracts-package.md) records why that changed.
- **Fetching** goes through one hook, `useApiResult`, which loads per key in an Effect with an
  `ignore` cleanup and derives the loading state in render. Sign-in and sign-out use `useTransition`
  for their pending state.
- **Errors**: `ErrorBoundary` wraps the tree, and API failures are values rather than throws, so they
  render inline and only a programming error reaches the boundary. Role checks in the UI are
  cosmetic: a `403` is shown honestly rather than swallowed.

## The two-organisation demo

The Playwright journey is the visible proof, and the API tests are the real one:

1. Sign out, pick the Acme Manager, read the Acme summary, sign out, pick the Blue River Manager,
   read the Blue River summary. The titles and numbers differ. This runs first because the Member
   submit below changes the Blue River completion count from 1 to 2 and would erase the proof that
   the numbers differ.
2. Pick **Blue River Member Mid Week** (the only seeded Member who can sign in and has not answered
   this week), answer the survey, submit, see the week that was answered, reload, submit again, see
   the duplicate message.
3. With the Blue River session, request Acme's survey id through the API and get `404`. Switching
   organisation is always a sign-out and a sign-in, never an organisation id in a request.

## CSS plan

One hand-written stylesheet layer, no framework, no CSS modules, no CSS-in-JS.

- `src/styles/tokens.css`: `:root` colour, space, radius, type and border tokens, plus one
  `@media (prefers-color-scheme: dark)` block that overrides the colour tokens only. The set is
  small: canvas, surface, text, muted text, border, accent, danger, focus; five space steps; two
  radii; three type sizes; one border width.
- `src/styles/app.css`: a small reset, the page layout, and one class per block: `.page`, `.card`,
  `.stack`, `.field`, `.fieldset`, `.button`, `.badge`, `.picker`, `.week`, `.summary`, `.muted`,
  `.error`, `.notice`, with a `:focus-visible` ring on every interactive element.
- Components: `ErrorBoundary`, `QuestionField` (one rating or yes/no question, labelled), and
  `SummaryPanel`. Everything else is a screen. Each question is a `fieldset` with a `legend`, every
  input has a label, the submit result is an `aria-live="polite"` region, and errors use
  `role="alert"`.
- Delete the template: `src/App.css`, `src/assets/`, and the `App.test.tsx` template-copy smoke test.
