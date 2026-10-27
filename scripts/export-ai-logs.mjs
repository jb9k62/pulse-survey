#!/usr/bin/env node
/**
 * Export a log of the AI sessions run in this repository into ai-logs/ (requirement 7.5):
 * for each Claude Code and pi session started in this directory, its date, tool, model and
 * title, and the prompts the human typed, in order. Nothing else: no tool calls, no tool
 * output, no model replies. That is the steering record the brief asks for, and it
 * keeps the files, paths and machine details the tools saw out of the repository.
 *
 * Sources, both JSONL written by the tools themselves:
 *   - Claude Code: ~/.claude/projects/<this repo, dashed>/<session>.jsonl
 *   - pi:          ~/.pi/agent/sessions/-<this repo, dashed>--/<timestamp>_<session>.jsonl
 *
 * Prompts are still redacted, since a prompt can quote a path or a pasted value: this repo's
 * absolute path becomes relative, any other home path becomes [path], and email addresses,
 * IP addresses other than loopback, and credential-shaped strings are replaced. Personal
 * terms (names, handles) are read from ~/.config/ai-logs-redact.json, which never enters the
 * repository, so this script does not publish the words it hides. The script refuses to run
 * without that file, then scans its own output and exits 1, naming only the file and the kind
 * of match, if anything redactable survives.
 *
 * Usage: node scripts/export-ai-logs.mjs [--out ai-logs]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.resolve(
  REPO,
  process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1]
    : 'ai-logs',
);
const DASHED = REPO.replaceAll('/', '-');
const CLAUDE_DIR = path.join(HOME, '.claude/projects', DASHED);
const PI_DIR = path.join(HOME, '.pi/agent/sessions', `-${DASHED}--`);
const PRIVATE_TERMS = path.join(HOME, '.config/ai-logs-redact.json');

if (!fs.existsSync(PRIVATE_TERMS)) {
  console.error(
    `Missing ${PRIVATE_TERMS}. Create it with {"terms": [...], "exactTerms": [...]} ` +
      '(names and handles to redact) before exporting.',
  );
  process.exit(1);
}
const privateTerms = JSON.parse(fs.readFileSync(PRIVATE_TERMS, 'utf8'));

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (term, flags) =>
  new RegExp(`(?<![A-Za-z0-9])${escape(term)}(?![A-Za-z0-9])`, flags);

// Each rule is [kind, pattern, replacement]. The same patterns drive the leak scan.
const RULES = [
  ['repo path', new RegExp(escape(REPO), 'g'), '.'],
  ['home path', /(?:\/home|\/Users)\/[^\s'"`)\]]*/g, '[path]'],
  ['home path', /~\/[^\s'"`)\]]*/g, '[path]'],
  [
    'home path',
    new RegExp(
      `[^\\s'"\`]*-home-${escape(path.basename(HOME))}-[^\\s'"\`]*`,
      'g',
    ),
    '[path]',
  ],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [
    'ip address',
    /\b(?!127\.0\.0\.1\b)(?!0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g,
    '[ip]',
  ],
  ['remote url', /\b(?:ssh|git):\/\/\S+/g, '[remote]'],
  [
    'credential',
    /\b(?:ctx7sk|csk|sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
    '[credential]',
  ],
  [
    'credential',
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_\w{20,}|\bAKIA[0-9A-Z]{16}\b/g,
    '[credential]',
  ],
  ['credential', /--(?:api-key|token|password)[= ]\S+/g, '[credential]'],
  ['credential', /\bBearer\s+\S{16,}/gi, '[credential]'],
  ...(privateTerms.terms ?? []).map((term) => [
    'personal term',
    word(term, 'gi'),
    '[redacted]',
  ]),
  ...(privateTerms.exactTerms ?? []).map((term) => [
    'personal term',
    word(term, 'g'),
    '[redacted]',
  ]),
  ['personal term', word(os.hostname(), 'gi'), '[redacted]'],
];

function redact(text) {
  let out = String(text);
  for (const [, pattern, replacement] of RULES)
    out = out.replace(pattern, replacement);
  return out;
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

// Harness notices (/clear, task notifications, command caveats) arrive as user rows too.
const isHarnessText = (text) => text.trimStart().startsWith('<');

function claudeSession(file) {
  const session = {
    tool: 'Claude Code',
    model: null,
    title: null,
    first: null,
    prompts: [],
  };
  for (const row of readJsonl(file)) {
    if (row.isSidechain) continue;
    if (row.type === 'ai-title' && row.aiTitle) session.title = row.aiTitle;
    if (row.type === 'assistant') session.model ??= row.message?.model ?? null;
    // A prompt typed while the model was working is stored as a queued command.
    const queued = row.type === 'attachment' ? row.attachment : null;
    if (queued?.type === 'queued_command' && queued.origin?.kind === 'human') {
      session.first ??= row.timestamp;
      session.prompts.push({
        at: queued.timestamp ?? row.timestamp,
        text: queued.prompt,
        midTurn: true,
      });
      continue;
    }
    if (row.type !== 'user' || row.isMeta) continue;
    const content = row.message?.content;
    const texts =
      typeof content === 'string'
        ? [content]
        : (content ?? [])
            .filter((item) => item.type === 'text')
            .map((item) => item.text);
    for (const text of texts) {
      if (!text || isHarnessText(text)) continue;
      session.first ??= row.timestamp;
      session.prompts.push({ at: row.timestamp, text });
    }
  }
  return session;
}

function piSession(file) {
  const session = {
    tool: 'pi',
    model: null,
    title: null,
    first: null,
    prompts: [],
  };
  for (const row of readJsonl(file)) {
    if (row.type === 'model_change') session.model = row.modelId;
    if (row.type !== 'message' || row.message?.role !== 'user') continue;
    const content = row.message.content;
    const texts =
      typeof content === 'string'
        ? [content]
        : (content ?? [])
            .filter((item) => item.type === 'text')
            .map((item) => item.text);
    for (const raw of texts) {
      // A skill invocation arrives as the whole skill file; keep its name and the ask after it.
      const skill = /^<skill name="([^"]+)"/.exec(raw);
      const asked = skill
        ? `[skill: ${skill[1]}] ${raw.split('</skill>').slice(1).join('</skill>').trim()}`
        : raw;
      // pi appends its own notice when a prompt arms workflows mode; the human did not type it.
      const text = asked.split('\n---\n[workflows mode armed.')[0];
      if (!text.trim()) continue;
      session.first ??= row.timestamp;
      session.title ??= text.replace(/\s+/g, ' ').slice(0, 70);
      session.prompts.push({ at: row.timestamp, text });
    }
  }
  return session;
}

function sessionsIn(dir, read) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({
      id: name.replace('.jsonl', '').split('_').pop(),
      ...read(path.join(dir, name)),
    }))
    .filter((session) => session.prompts.length > 0);
}

const sessions = [
  ...sessionsIn(CLAUDE_DIR, claudeSession),
  ...sessionsIn(PI_DIR, piSession),
].sort((a, b) => String(a.first).localeCompare(String(b.first)));

// Quote each prompt as a blockquote, so its own Markdown cannot break the page.
const quote = (text) =>
  text
    .trimEnd()
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');

const lines = [
  '# AI session log',
  '',
  'Every Claude Code and pi session run in this repository, oldest first, with the prompts the',
  'human typed, generated by `node scripts/export-ai-logs.mjs`. Tool calls, tool output and model',
  'replies are left out; `SOLUTION.md` section 7 records what each turn produced and how it was',
  'checked. Paths outside the repository, names, email addresses, hosts and credentials are',
  'redacted. Subagent and workflow agents are not listed: their briefs appear in the prompts and',
  'in the validation log.',
  '',
  `${sessions.length} sessions: ${sessions.filter((s) => s.tool === 'Claude Code').length} Claude Code, ${sessions.filter((s) => s.tool === 'pi').length} pi.`,
];
for (const session of sessions) {
  lines.push(
    '',
    `## ${session.first?.slice(0, 16).replace('T', ' ')} UTC, ${session.tool}: ${session.title ?? 'untitled'}`,
    '',
    `Model: ${session.model ?? 'unknown'}. Session: \`${session.id.slice(0, 8)}\`.`,
  );
  session.prompts.forEach((prompt, index) => {
    // The time, with the date too when the session has run past its first day.
    const sameDay = prompt.at?.slice(0, 10) === session.first?.slice(0, 10);
    const when =
      (sameDay
        ? prompt.at?.slice(11, 16)
        : prompt.at?.slice(0, 16).replace('T', ' ')) ?? '';
    lines.push(
      '',
      `**${index + 1}.** ${when}${prompt.midTurn ? ', sent mid-turn' : ''}`,
      '',
      quote(prompt.text),
    );
  });
}
const output = redact(`${lines.join('\n')}\n`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'README.md'), output);

// The leak scan re-runs every rule on the output. A match means a replacement produced text a
// rule still matches, or a rule is wrong; either way nothing is written to the console but the
// kind and the line, so the scan itself leaks nothing.
let leaks = 0;
output.split('\n').forEach((line, index) => {
  for (const [kind, pattern] of RULES) {
    if (kind === 'repo path') continue;
    pattern.lastIndex = 0;
    if (pattern.test(line)) {
      leaks++;
      console.error(`possible ${kind} on line ${index + 1}`);
    }
  }
});
console.log(
  `Wrote ${sessions.length} sessions to ${path.relative(REPO, OUT)}/README.md`,
);
if (leaks) process.exit(1);
