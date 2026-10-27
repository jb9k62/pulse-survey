// save-workflows.mjs
//
// Register the workflow scripts under workflows/*.workflow.js as project-scoped
// saved workflows in the pi harness, so they run by name:
//
//   /workflows run design_spec
//   /workflows run implement_slices
//
// The repo .workflow.js files stay the single source of truth; this script
// copies each script inline into the harness's saved-workflow JSON. Re-run it
// after editing a workflow. Project-scoped state lives under
// ~/.pi/workflows/projects/<project-slug>-<hash>/saved/.

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const cwd = process.cwd();
const projectPath = resolve(cwd);
const slug =
  basename(projectPath)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
const hash = createHash('sha256')
  .update(projectPath)
  .digest('hex')
  .slice(0, 12);
const savedDir = join(
  homedir(),
  '.pi',
  'workflows',
  'projects',
  `${slug}-${hash}`,
  'saved',
);

const WORKFLOWS = [
  { file: 'design-spec.workflow.js', name: 'design_spec' },
  { file: 'implement-slices.workflow.js', name: 'implement_slices' },
];

function metaString(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

mkdirSync(savedDir, { recursive: true });

for (const workflow of WORKFLOWS) {
  const file = join(cwd, 'workflows', workflow.file);
  const script = readFileSync(file, 'utf-8');

  const metaName = metaString(script, 'name');
  const metaDescription = metaString(script, 'description');
  if (metaName !== workflow.name) {
    console.error(
      `Mismatch: ${workflow.file} declares meta.name "${metaName}" but this script expects "${workflow.name}".`,
    );
    process.exitCode = 1;
    continue;
  }
  if (!metaDescription) {
    console.error(`No meta.description found in ${workflow.file}.`);
    process.exitCode = 1;
    continue;
  }

  const record = {
    name: workflow.name,
    description: metaDescription,
    script,
    savedAt: new Date().toISOString(),
    path: join(savedDir, `${workflow.name}.json`),
  };

  writeFileSync(record.path, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Saved ${workflow.name} -> ${record.path}`);
}
