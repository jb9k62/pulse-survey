---
name: react-reference
description: >
  Map of verified React 19.3 patterns inside this repo's pinned sources: the react.dev docs
  checkout at references/react.dev and the React source at references/react. Covers components,
  state, effects, forms and Actions, data fetching, Suspense, TypeScript, testing, the React
  Compiler and the rules of React. Use when writing, reviewing or debugging React code in this
  project, and before inventing an API or copying an example from a blog or an older React version.
---

# React reference

React is vendored in this repo twice: the documentation site and the library source. Both are
read-only git submodules pinned by commit. Together they are the source of truth for how React
19.3 behaves, so read them instead of guessing or trusting a tutorial.

| What | Path | Pin | Missing after a clone |
|---|---|---|---|
| Docs (react.dev) | `references/react.dev` | commit `44b0b5f10b7f6477bf146d26444717fb4930439f`, docs site version 19.3 (shallow, depth 1) | `git submodule update --init --depth 1` |
| Source | `references/react` | commit `1d34f91dfde6bba84d08b683aaba164c7194dacb`, tag `v19.3.0` (shallow, depth 1) | `git submodule update --init --depth 1` |

The commit is the authoritative pin. A fresh clone fetches that one commit, not the tag ref, so
`git describe --tags` inside `references/react` can fail with "No names found". Confirm the
version from `references/react/packages/react/package.json` (`"version": "19.3.0"`) or from
`references/react.dev/src/siteConfig.js` (`version: '19.3'`).

**Full page index:** `docs-index.md` beside this file lists every documentation page in the docs
checkout with its canonical react.dev URL and its local path, plus the release posts (the rest of
the blog is excluded). Regenerate it with `npm run react:index` after the
submodule moves; `npm run react:index -- --check` fails if it is stale. Read this skill for the
short list, the index when you need a page that is not named here.

Every path below is relative to the **repository root**. This skill file lives at
`.pi/skills/react-reference/SKILL.md`.

Treat both submodules as read-only. Never edit them, never import from them, never add them to
`tsconfig` paths. They are reference material only.

## Rule

Do not invent React APIs. Find the page in `references/react.dev/src/content` first, then write
the project code to match. The docs are pinned, so the local file beats the live website: the
website tracks the latest release and has no selector for 19.x minors.

- For **what an API is and how to use it**, read the docs page.
- For **why it behaves the way it does**, read the source in `references/react`.
- For **what changed in a release**, read the release post in
  `references/react.dev/src/content/blog/` (for example `blog/2026/09/09/react-19-3.md`).

## This app is a client-only SPA

The front end is a single-page app rendered entirely in the browser. It is **not** a React Server
Components app, there is no server rendering, and there is no React framework. The browser calls
the NestJS API over HTTP and renders what comes back. This is a deliberate scope decision, not an
omission: the requirements ask for a very small UI that exercises the API, and the docs say a build
tool such as Vite starts exactly this way (`learn/build-a-react-app-from-scratch.md`: "The build
tools listed above start off with a client-only, single-page app (SPA)").

What that rules out, and where the docs say so:

| Not used | Why | Read |
|---|---|---|
| `'use client'` and `'use server'` directives | The directives page opens with "Directives are for use in React Server Components", and there is no server component boundary to mark | `references/react.dev/src/content/reference/rsc/directives.md` |
| Server Components and Server Functions | There is no bundler or framework runtime to host them, and the API is a plain HTTP service | `references/react.dev/src/content/reference/rsc/server-components.md`, `references/react.dev/src/content/reference/rsc/server-functions.md` |
| `react-dom/server` (`renderToString`, `renderToPipeableStream`, `renderToReadableStream`) | Nothing renders on a server, so there is no HTML to stream | `references/react.dev/src/content/reference/react-dom/server/` |
| `hydrateRoot` | It attaches handlers to server-rendered HTML. A client-only app has none, and `createRoot` is the supported call | `references/react.dev/src/content/reference/react-dom/client/createRoot.md` |
| The `permalink` argument of `useActionState` | The docs give it meaning only when the action is a Server Function and the form is submitted before the bundle loads | `references/react.dev/src/content/reference/react/useActionState.md` |
| The `react-server-dom-*` packages and `packages/react-client` in the source checkout | They are the RSC client runtime, and nothing in this app uses them | `references/react/packages/react-client/src/ReactFlightClient.js` (for reference only) |

Client-side best practices this app follows. Each one is a page in the pinned docs, so read the
page rather than this summary.

- **Render once with `createRoot`**, in the app entry point, inside `StrictMode`. The docs say
  `createRoot` is unsupported for server-rendered apps, which is the case that does not apply here.
- **Keep components pure.** Same inputs, same output, and no mutation of props or state during
  render (`reference/rules/components-and-hooks-must-be-pure.md`).
- **Fetch in an Effect with cleanup, or with `use` and a cached promise.** A stale response must
  not overwrite a newer one, so ignore or abort it in the cleanup
  (`learn/synchronizing-with-effects.md`, "Fetching data"). A promise passed to `use` must be
  cached so the same instance is reused across renders (`reference/react/use.md`).
- **Do not use an Effect for something you can compute.** A derived value belongs in the render
  body, not in state kept in step by an Effect (`learn/you-might-not-need-an-effect.md`).
- **Keep state minimal and close to its use.** Lift it only when two components must share it, and
  keep context for the signed-in user and organisation rather than for everything
  (`learn/sharing-state-between-components.md`, `learn/choosing-the-state-structure.md`).
- **Give lists stable keys.** Never the array index when the list can reorder
  (`learn/rendering-lists.md`).
- **Catch render errors at the top.** An error boundary is the only way to stop one bad screen
  from blanking the whole app (`reference/react/Component.md`).
- **Load a screen lazily only if it earns it.** `lazy` plus `Suspense` for code splitting, not as
  a default (`reference/react/lazy.md`).
- **Keep StrictMode on.** The double invocation in development is the feature
  (`reference/react/StrictMode.md`).
- **Avoid `dangerouslySetInnerHTML`.** If it is ever needed, the docs require the object to be
  built where the HTML is generated, not inline (`reference/react-dom/components/common.md`).
- **Type the props** (`learn/typescript.md`), and remember strict mode makes `useCallback`
  parameters need explicit types.
- **Test through `act`**, imported from `react` (`reference/react/act.md`).

## Where to look: docs

| I need to... | react.dev page | Local file |
|---|---|---|
| Start the app on the client | [`createRoot`](https://react.dev/reference/react-dom/client/createRoot) | `references/react.dev/src/content/reference/react-dom/client/createRoot.md` |
| Split a screen out of the bundle | [`lazy`](https://react.dev/reference/react/lazy), [`<Suspense>`](https://react.dev/reference/react/Suspense) | `references/react.dev/src/content/reference/react/lazy.md` |
| Build a new client-only React app | [Build a React App from Scratch](https://react.dev/learn/build-a-react-app-from-scratch) | `references/react.dev/src/content/learn/build-a-react-app-from-scratch.md` |
| Set up TypeScript with React | [Using TypeScript](https://react.dev/learn/typescript) | `references/react.dev/src/content/learn/typescript.md` |
| Components, props, lists, conditionals | [Describing the UI](https://react.dev/learn/describing-the-ui) | `references/react.dev/src/content/learn/describing-the-ui.md` |
| Add state, or pick a state shape | [Managing State](https://react.dev/learn/managing-state), [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) | `references/react.dev/src/content/learn/managing-state.md` |
| Handle a form submit | [`<form>`](https://react.dev/reference/react-dom/components/form), [`useActionState`](https://react.dev/reference/react/useActionState), [`useFormStatus`](https://react.dev/reference/react-dom/hooks/useFormStatus) | `references/react.dev/src/content/reference/react-dom/components/form.md` |
| Read the signed-in user in many components | [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context), [`createContext`](https://react.dev/reference/react/createContext), [`useContext`](https://react.dev/reference/react/useContext) | `references/react.dev/src/content/reference/react/useContext.md` |
| Fetch data when a screen loads | [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects), [`useEffect`](https://react.dev/reference/react/useEffect) | `references/react.dev/src/content/learn/synchronizing-with-effects.md` |
| Avoid an Effect that should not exist | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) | `references/react.dev/src/content/learn/you-might-not-need-an-effect.md` |
| Read a promise or context with Suspense | [`use`](https://react.dev/reference/react/use), [`<Suspense>`](https://react.dev/reference/react/Suspense) | `references/react.dev/src/content/reference/react/use.md` |
| Show a pending state while submitting | [`useTransition`](https://react.dev/reference/react/useTransition), [`useOptimistic`](https://react.dev/reference/react/useOptimistic) | `references/react.dev/src/content/reference/react/useTransition.md` |
| Show a server error (a rejected submit) | [`useActionState`](https://react.dev/reference/react/useActionState) | `references/react.dev/src/content/reference/react/useActionState.md` |
| Render a list of rows without key bugs | [Rendering Lists](https://react.dev/learn/rendering-lists) | `references/react.dev/src/content/learn/rendering-lists.md` |
| Reset or preserve form state | [Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state) | `references/react.dev/src/content/learn/preserving-and-resetting-state.md` |
| Catch an error thrown during render | [`Component`](https://react.dev/reference/react/Component) (`componentDidCatch`, the only error boundary API) | `references/react.dev/src/content/reference/react/Component.md` |
| Fix a "rendered too many times" loop | [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) | `references/react.dev/src/content/reference/rules/rules-of-hooks.md` |
| Understand a lint error from the hooks plugin | [Lints](https://react.dev/reference/eslint-plugin-react-hooks) | `references/react.dev/src/content/reference/eslint-plugin-react-hooks/lints/` |
| Write a test around a component | [`act`](https://react.dev/reference/react/act) | `references/react.dev/src/content/reference/react/act.md` |
| Debug re-renders in the browser | [React Developer Tools](https://react.dev/learn/react-developer-tools) | `references/react.dev/src/content/learn/react-developer-tools.md` |
| Cut re-renders | [`memo`](https://react.dev/reference/react/memo), [`useMemo`](https://react.dev/reference/react/useMemo), [React Compiler](https://react.dev/learn/react-compiler/introduction) | `references/react.dev/src/content/reference/react/memo.md` |
| Use a feature new in 19.2 or 19.3 | [`<ViewTransition>`](https://react.dev/reference/react/ViewTransition), [`<Activity>`](https://react.dev/reference/react/Activity) | `references/react.dev/src/content/reference/react/ViewTransition.md` |

## Where to look: source

| I need to know... | Read |
|---|---|
| What `react` actually exports at this pin | `references/react/packages/react/index.stable.js` |
| Where a Hook is defined and dispatched | `references/react/packages/react/src/ReactHooks.js`, `references/react/packages/react/src/ReactClient.js`, `references/react/packages/react-reconciler/src/ReactFiberHooks.js` |
| How a state update is scheduled and committed | `references/react/packages/react-reconciler/src/ReactFiberWorkLoop.js`, `references/react/packages/react-reconciler/src/ReactFiberBeginWork.js`, `references/react/packages/react-reconciler/src/ReactFiberCommitWork.js` |
| What `createRoot` does | `references/react/packages/react-dom/client.js`, `references/react/packages/react-dom/src/client/ReactDOMClient.js`, `references/react/packages/react-dom/src/client/ReactDOMRoot.js` |
| How DOM events are attached and dispatched | `references/react/packages/react-dom-bindings/src/events/DOMPluginEventSystem.js` |
| How server rendering works | `references/react/packages/react-dom/server.node.js`, `references/react/packages/react-server/src/ReactFizzServer.js` |
| How Server Components are consumed on the client (not used here) | `references/react/packages/react-client/src/ReactFlightClient.js` |
| How a compiler lint is implemented | `references/react/packages/eslint-plugin-react-hooks/src/index.ts` |
| A tested example of a form, a root or a Hook | `references/react/packages/react-dom/src/__tests__/ReactDOMForm-test.js`, `references/react/packages/react-dom/src/__tests__/ReactDOMRoot-test.js`, `references/react/packages/react-reconciler/src/__tests__/ReactHooksWithNoopRenderer-test.js` |
| A small runnable app | `references/react/fixtures/dom`, `references/react/fixtures/ssr`, `references/react/fixtures/view-transition` |

## Version gotchas

Real differences in 19.3 that older tutorials and blog posts get wrong.

- **`forwardRef` is legacy.** The docs say it "will be deprecated in a future release" and that
  `ref` is a normal prop. Read `reference/react/forwardRef.md` before adding a new one, and check
  whether a plain prop does the job.
- **`ReactDOM.render` is gone.** Client rendering is `createRoot` from `react-dom/client`. The
  legacy root only exists for older code, and it is documented as legacy.
- **`react-dom/test-utils` and `react-test-renderer` are deprecated.** Import `act` from `react`,
  not from `react-dom/test-utils`. Both deprecation pages are in
  `references/react.dev/src/content/warnings/`.
- **Stable at this pin:** `use`, `useActionState`, `useOptimistic`, `useEffectEvent`, `Activity`,
  `ViewTransition` and `addTransitionType`. Confirm against `packages/react/index.stable.js`
  rather than assuming a feature is canary.
- **Experimental at this pin:** the experimental build exports more than the stable one, including
  `unstable_SuspenseList`, `unstable_getCacheForType`, `unstable_startGestureTransition` and
  `optimisticKey`, plus `unstable_Activity` (the experimental alias of the stable `Activity`) and
  `experimental_useOptimistic`. Treat `packages/react/index.stable.js` as the list of what is safe
  to use, and do not use anything that appears only in `index.experimental.js`.
- **The hooks lint plugin is 7.0.0** and its docs page is marked `version: rc`. It now carries the
  compiler-era lints (`purity`, `immutability`, `set-state-in-render`, `static-components`,
  `preserve-manual-memoization` and others), which flag code that older rules accepted.
- **The React Compiler is a build-time tool, not a React feature.** It ships as the dev
  dependency `babel-plugin-react-compiler` and needs no configuration for React 19. See
  `references/react.dev/src/content/learn/react-compiler/installation.md`.
- **StrictMode double-invokes effects and render in development.** That is the point of it, so do
  not remove StrictMode to make a bug go away, and do not treat a duplicated fetch in development
  as a production bug without checking.
- **The docs site covers 19.x only.** There is no page selector for 19.2 against 19.3, so check
  the release posts in `blog/` when a minor matters.
- **Create React App is deprecated.** The docs recommend a framework for new apps, or a build tool
  such as Vite, Parcel or Rsbuild when a framework is not a good fit.

## Project rules that override the docs

- **Tenant isolation comes first.** The organisation always comes from the authenticated user.
  The UI must never send an organisation id in a body, query string or route param, and must never
  read one from the URL and trust it. The client is not the isolation boundary: the API is.
- **The database is the enforcement point for one response per active week.** Disabling the submit
  button is a courtesy. The real answer is the server's response, so handle a rejected duplicate
  submit (a 409) as a normal outcome and show it, rather than assuming the button prevented it.
- **Role checks in the UI are cosmetic.** Hiding a Manager-only view is not authorisation. The API
  must still refuse a Member who calls the endpoint directly, and the UI should show the refusal
  honestly instead of blanking out.
- **No new core frameworks or data libraries without asking.** `AGENTS.md` fixes the stack, so
  Next.js, React Router, TanStack Query and similar are out for this slice, even though the docs
  recommend a framework for new apps. This is a client-only SPA against a NestJS API, with no
  Server Components, no server rendering and no server functions (see the section above).
- **Vite is the build tool if we build from scratch.** `npm create vite@latest my-app --
  --template react-ts` is the command the docs give. Do not reach for Create React App.
- **TypeScript strict mode.** `@types/react` and `@types/react-dom` are dev dependencies, and
  `tsconfig.json` needs `dom` in `lib` and `jsx` set. See `learn/typescript.md` for the exact
  options, and note that strict mode makes `useCallback` parameters need explicit types.
- **A JSON response from our API is untyped at runtime.** Validate the shape once where the
  response is parsed, then pass typed values down, so a malformed payload fails at the edge of the
  app instead of as `undefined` deep inside a render.
- **Keep the UI minimal.** Two flows: a Member answers the active survey, a Manager reads the
  weekly summary. No routing, no global store, no design system, unless the human asks.
