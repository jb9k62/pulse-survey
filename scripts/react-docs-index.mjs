#!/usr/bin/env node
/**
 * react-docs-index.mjs
 *
 * Parse the pinned react.dev docs checkout under `references/react.dev` and write a
 * resource index for agents to `.pi/skills/react-reference/docs-index.md`.
 *
 * Why this exists: an agent asked to write React should point at the real page, not a
 * remembered one. The docs are vendored as a read-only submodule, so the index is
 * derived from that exact commit rather than hand-written, and can be regenerated
 * whenever the submodule moves.
 *
 * What it reads:
 *   references/react.dev/src/content/**\/*.md   page frontmatter (title, version)
 *   references/react.dev/src/sidebarLearn.json       grouping and order
 *   references/react.dev/src/sidebarReference.json   grouping and order
 *   references/react.dev/src/siteConfig.js           the docs site version
 *   references/react/package.json                    the pinned React version
 *
 * Usage:
 *   node scripts/react-docs-index.mjs [--check]
 *
 *   --check   write nothing; exit 1 if the committed index differs from the parsed one
 *
 * No dependencies beyond Node. Run from the repository root.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const DOCS_ROOT = path.join(REPO_ROOT, 'references/react.dev');
const CONTENT_ROOT = path.join(DOCS_ROOT, 'src/content');
const REACT_ROOT = path.join(REPO_ROOT, 'references/react');
const OUT_FILE = path.join(
  REPO_ROOT,
  '.pi/skills/react-reference/docs-index.md',
);
const SITE_URL = 'https://react.dev';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');

function fail(message) {
  console.error(`react-docs-index: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(CONTENT_ROOT)) {
  fail(
    'references/react.dev is missing. Run `git submodule update --init --depth 1` first.',
  );
}

if (!fs.existsSync(path.join(REACT_ROOT, 'packages/react/package.json'))) {
  fail(
    'references/react is missing. Run `git submodule update --init --depth 1` first.',
  );
}

// --- read the two versions ---------------------------------------------------

function siteVersion() {
  const src = fs.readFileSync(
    path.join(DOCS_ROOT, 'src/siteConfig.js'),
    'utf8',
  );
  const m = src.match(/version:\s*'([^']+)'/);
  return m ? m[1] : 'unknown';
}

function reactVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(REACT_ROOT, 'packages/react/package.json'),
      'utf8',
    ),
  );
  return pkg.version;
}

// --- parse every page --------------------------------------------------------

/** A page is `title` plus the frontmatter and body markers that matter to a reader. */
function parsePage(relFromContent) {
  const abs = path.join(CONTENT_ROOT, relFromContent);
  const text = fs.readFileSync(abs, 'utf8');

  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const body = fmMatch ? text.slice(fmMatch[0].length) : text;

  // Most pages carry `title:`. A few DOM component pages use the tag as the key
  // instead (`link: "<link>"`), so fall back to the first string-valued key.
  const fields = new Map();
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
    if (m) fields.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  const title = fields.get('title') || [...fields.values()][0] || '';

  const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);

  return {
    title,
    version: versionMatch ? versionMatch[1].trim() : 'stable',
    experimental: /<Experimental[\s>]/.test(body),
    canary: /<Canary[\s>]/.test(body),
    lines: body.split('\n').length,
  };
}

/** `/reference/react/useState` -> `reference/react/useState.md` (and `/learn` -> `learn/index.md`). */
function pathToRel(pagePath) {
  const clean = pagePath.replace(/^\/+|\/+$/g, '');
  if (clean === '') return 'index.md';
  const direct = `${clean}.md`;
  if (fs.existsSync(path.join(CONTENT_ROOT, direct))) return direct;
  const asIndex = `${clean}/index.md`;
  if (fs.existsSync(path.join(CONTENT_ROOT, asIndex))) return asIndex;
  return null;
}

/** Pages without frontmatter (the error decoder) still need a readable name. */
function fallbackTitle(rel) {
  const [dir, name] = [path.dirname(rel), path.basename(rel, '.md')];
  if (name === 'index') return dir === '.' ? rel : `${dir} overview`;
  if (dir === 'errors') return `Error ${name}`;
  return `${dir === '.' ? '' : `${dir}: `}${name}`;
}

// --- walk the sidebars -------------------------------------------------------

function readSidebar(name) {
  return JSON.parse(fs.readFileSync(path.join(DOCS_ROOT, 'src', name), 'utf8'));
}

/** `react@{{version}}` reads as `react` in the index. */
function cleanSection(section) {
  return section.replace(/@\{\{version\}\}/g, '').trim();
}

/**
 * Flatten a sidebar into ordered entries. A `hasSectionHeader` node starts a new
 * section; a node with `routes` starts a group named after its title and is itself an
 * entry (those group pages are real pages, such as the Hooks index); leaves inside a
 * group are entries under it.
 */
function flattenSidebar(root, label) {
  const entries = [];

  const walk = (nodes, group, section) => {
    let currentGroup = group;
    let currentSection = section;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (node.hasSectionHeader) {
        currentSection = cleanSection(node.sectionHeader || currentSection);
        currentGroup = null;
        continue;
      }

      const isLeaf = !node.routes || node.routes.length === 0;
      const nextGroup = isLeaf ? currentGroup : node.title || currentGroup;

      if (node.path) {
        const rel = pathToRel(node.path);
        if (rel)
          entries.push({
            section: currentSection,
            group: nextGroup,
            path: node.path,
            rel,
          });
        else unresolved.push(node.path);
      }

      if (!isLeaf) walk(node.routes, nextGroup, currentSection);
    }
  };

  walk(root.routes || [], null, label);
  return entries;
}

/** Release posts are the only blog pages worth an agent's time. */
const RELEASE_NOTE = /^React (v?\d|Compiler v|19 Upgrade)/;

// --- build the document ------------------------------------------------------

const site = siteVersion();
const react = reactVersion();

const allPages = new Map(); // rel -> parsed page
(function collect(dir) {
  for (const entry of fs.readdirSync(path.join(CONTENT_ROOT, dir), {
    withFileTypes: true,
  })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) collect(rel);
    else if (entry.name.endsWith('.md')) allPages.set(rel, parsePage(rel));
  }
})('');

const seen = new Set();
const sidebarGroups = [];
const unresolved = [];

for (const [label, file] of [
  ['Learn React', 'sidebarLearn.json'],
  ['API Reference', 'sidebarReference.json'],
]) {
  const deduped = [];
  for (const g of flattenSidebar(readSidebar(file), label)) {
    if (seen.has(g.rel)) continue;
    seen.add(g.rel);
    deduped.push(g);
  }
  sidebarGroups.push({ label, groups: deduped });
}

// A sidebar entry that resolves to no file would silently drop a page from the index,
// so it is a hard failure rather than a warning.
if (unresolved.length) {
  fail(
    `the sidebar lists ${unresolved.length} path(s) with no matching file: ${unresolved.join(', ')}`,
  );
}

const releaseNotes = [...allPages.keys()]
  .filter(
    (rel) =>
      rel.startsWith('blog/') && RELEASE_NOTE.test(allPages.get(rel).title),
  )
  .sort();
for (const rel of releaseNotes) seen.add(rel);

function statusOf(page) {
  if (!page) return '';
  const marks = [];
  if (page.version && page.version !== 'stable') marks.push(page.version);
  if (page.experimental && !marks.includes('experimental'))
    marks.push('experimental');
  if (page.canary && !marks.includes('canary')) marks.push('canary');
  return marks.join(', ');
}

function entryLine(rel, indent = '') {
  const page = allPages.get(rel);
  const slug = rel.replace(/\.md$/, '').replace(/\/index$/, '');
  const url = slug === 'index' ? SITE_URL : `${SITE_URL}/${slug}`;
  const title = page?.title || fallbackTitle(rel);
  const status = statusOf(page);
  const suffix = status ? ` _(${status})_` : '';
  return `${indent}- [${title}](${url})${suffix} - \`references/react.dev/src/content/${rel}\``;
}

const out = [];
out.push('<!-- Generated by `npm run react:index`. Do not edit by hand. -->');
out.push('');
out.push('# react.dev page index');
out.push('');
out.push(
  `Every documentation page in the pinned react.dev checkout, with its canonical URL and the ` +
    `local file, plus the release posts. The rest of the blog is excluded. ` +
    `Docs site version **${site}**, React package version **${react}**.`,
);
out.push('');
out.push('Regenerate after the submodule moves: `npm run react:index`.');
out.push('');

for (const { label, groups } of sidebarGroups) {
  out.push(`## ${label}`);
  out.push('');
  let lastSection = null;
  let lastGroup = null;
  for (const g of groups) {
    if (g.section && g.section !== lastSection) {
      out.push(`### ${g.section}`);
      out.push('');
      lastSection = g.section;
      lastGroup = null;
    }
    if (g.group && g.group !== lastGroup) {
      out.push(`#### ${g.group}`);
      out.push('');
      lastGroup = g.group;
    }
    out.push(entryLine(g.rel));
  }
  out.push('');
}

// Anything the sidebars do not reach: error messages, warnings, community pages.
const leftovers = [...allPages.keys()]
  .filter((rel) => !seen.has(rel) && !rel.startsWith('blog/'))
  .sort();
if (leftovers.length) {
  out.push('## Other pages');
  out.push('');
  const byDir = new Map();
  for (const rel of leftovers) {
    const dir = path.dirname(rel) === '.' ? '' : path.dirname(rel);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(rel);
  }
  for (const [dir, rels] of byDir) {
    out.push(`### ${dir || 'root'}`);
    out.push('');
    for (const rel of rels) out.push(entryLine(rel));
    out.push('');
  }
}

if (releaseNotes.length) {
  out.push('## Release notes');
  out.push('');
  out.push(
    'What changed in each release. Read the post for the minor you are on before' +
      ' assuming a feature is available.',
  );
  out.push('');
  for (const rel of releaseNotes) out.push(entryLine(rel));
  out.push('');
}

const rendered = `${out
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd()}\n`;

// Count what the index actually holds, not every file in the checkout: the blog is excluded
// except for the release posts, so allPages.size would overstate it.
const entryCount = out.filter((line) => line.startsWith('- [')).length;
const excluded = allPages.size - entryCount;

if (checkOnly) {
  const current = fs.existsSync(OUT_FILE)
    ? fs.readFileSync(OUT_FILE, 'utf8')
    : '';
  if (current !== rendered) {
    console.error(
      'react-docs-index: the committed index is stale. Run `npm run react:index`.',
    );
    process.exit(1);
  }
  console.log(`react-docs-index: up to date (${entryCount} entries)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, rendered);
console.log(
  `react-docs-index: wrote ${path.relative(REPO_ROOT, OUT_FILE)} ` +
    `(${entryCount} entries; ${allPages.size} pages in the checkout, ${excluded} excluded)`,
);
