---
type: Architectural Decision
title: "ADR-0001: Keep the design in an OKF bundle"
description: Why design depth lives in an Open Knowledge Format bundle, with SOLUTION.md as a short summary that links in.
tags: [documentation, okf, adr]
generated: { by: deepseek-ai/DeepSeek-V4.1-Flash, at: 2026-09-25 }
verified: { by: "human:Jordan Hunt", at: 2026-09-26 }
sources:
  - resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: OKF v0.2 specification
  - resource: scripts/okf-view.mjs
---

# ADR-0001: Keep the design in an OKF bundle

- **Status:** accepted
- **Date:** 2026-09-25
- **Deciders:** Jordan Hunt

## Context

The brief requires `SOLUTION.md` to carry the design, the trade-offs, the AWS note and
the AI workflow, and it also asks for a spec or plan committed before any code. Those are
different documents with different readers, and one file that holds all of them becomes hard
to scan and impossible to link into a single section. The work is also largely AI-assisted, so
each claim needs to say where it came from and whether a person has checked it.

## Decision

We will keep design depth in `okf/`, an
[Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF) v0.2 bundle, and keep `SOLUTION.md` as the short deliverable that links in. OKF is a
small spec for knowledge as markdown: one concept per file, linked by bundle-relative paths,
with YAML frontmatter recording each concept's `type`, its `sources`, who wrote it
(`generated`), whether a person checked it (`verified`), and its `status`.

## Consequences

### Positive

- Structured frontmatter lets tools work with the docs. `npm run okf:validate` checks the
  bundle against the spec, and `npm run okf:view` writes one self-contained HTML file: a
  clickable concept graph beside a reading pane that renders every Mermaid diagram.
- Each concept names its sources and who generated or verified it, which is exactly what the
  AI-workflow part of the brief asks to be able to show.
- Readers choose their depth: the summary, one concept, or the code.
- One concept per file keeps the tenant-isolation rules, the data model and the API contract
  separately linkable, so a rule can be cited from a test or a commit message.

### Trade-offs

- More files than one document, and a bundle that needs its own tooling to stay honest.
- Bundle-root links such as `/pulse-surveys/api.md` do not resolve when browsing the markdown
  on GitHub. The viewer resolves them, so those links are only useful through `viz.html`.
- `okf/viz.html` is generated and gitignored, so it needs regenerating after edits.
- Concepts can drift from the code. Only a review pass, recorded as `verified`, keeps them
  true.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| One long `SOLUTION.md` | Hard to scan and link into, with no per-section sources or review status. |
| A docs site generator (VitePress, Docusaurus) | A build, dependencies and configuration for a handful of pages, in a timeboxed build. |
| Plain `docs/*.md` with no frontmatter | Simpler, but no place to record sources, generator or review status, and no way to check the bundle automatically. |
