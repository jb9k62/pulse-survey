---
type: Application
title: CONCEPT TITLE
description: One-sentence summary of what this concept is and who it is for.
tags: [TAG-A, TAG-B]
generated: { by: pi-coding-agent, at: YYYY-MM-DD }
sources:
  - resource: PATH/TO/FILE.EXT
---

# CONCEPT TITLE

Lead paragraph: what this concept covers, and who it is for.

## SECTION HEADING

Write the body in clean markdown. Keep concepts short: link to another concept instead of
repeating its content.

- Link to a concept inside this bundle with a bundle-root path and descriptive link text, for
  example [the architecture](/SLUG/architecture.md), not the raw path. Bundle-root links don't
  resolve when browsing the markdown on GitHub; the viewer resolves them.
- A file outside the bundle (the README, source code) doesn't get a bundle link: name it in
  `sources` above, or refer to it as a code path in the text, for example `src/example.ts`.
- A fenced mermaid block renders as a diagram in the viewer's detail panel.
- A blockquote whose first line is `> [!type] Title` renders as a styled callout. Recognised
  types: `note`, `tip`, `important`, `warning`, `caution`, `definition`, `example`, `edge-case`.
  An unknown type stays an ordinary blockquote.
- A fenced `quiz` block renders as click-to-check questions. Questions are separated by a `---`
  line, options are `- [ ]` or `- [x]` with exactly one correct, and a `~` line after an option is
  its feedback. Question and option text is plain text, so markdown inside it shows literally. Use
  a quiz only where a reader is meant to test themselves.
- A fenced `widget` block whose only line is a widget name (`week-bounds`, `eligibility`,
  `summary-stats`, `rls-playground`) mounts that React widget from `packages/okf-widgets`. Add a
  new widget there, give one control `data-probe` so the render gate can drive it, and prefer
  importing the app's own pure code over copying it.

## Notes on the frontmatter above (delete this section)

- `type` is the only required field. Pick one that matches the node palette (Application,
  Explainer, Architecture, Data Model, API Reference, Reference, Architectural Decision, Process,
  Metric, Playbook); anything else still works but renders in a neutral grey. `Explainer` is a
  bundle-local addition for a guided walk across several concepts, and the viewer carries a
  palette entry for it.
- `sources` should point at the code or document this concept describes, not at a summary
  document the text was copied from.
- Leave `status` out. It defaults to `stable`. Set it to `draft` while still writing, or
  `deprecated` once the concept no longer applies.
- Don't add `verified` until a person has actually reviewed this text: an unreviewed
  `verified` entry defeats the viewer's "unverified" badge.
