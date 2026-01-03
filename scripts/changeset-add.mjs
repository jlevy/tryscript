#!/usr/bin/env node
/**
 * Non-interactive changeset creation for agents and automation.
 *
 * Usage: node scripts/changeset-add.mjs <bump> <version> "<summary>"
 *
 * Examples:
 *   node scripts/changeset-add.mjs patch 0.1.1 "Fix parsing bug"
 *   node scripts/changeset-add.mjs minor 0.2.0 "Add new export format"
 *   node scripts/changeset-add.mjs major 1.0.0 "Breaking API changes"
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const [, , bump, version, summary] = process.argv;

if (!bump || !version || !summary) {
  console.error('Usage: changeset-add <bump> <version> <summary>');
  console.error('');
  console.error('Arguments:');
  console.error('  bump     Version bump type: patch, minor, or major');
  console.error('  version  Target version (e.g., 0.1.0)');
  console.error('  summary  Description of changes');
  console.error('');
  console.error('Example: changeset-add minor 0.2.0 "Add new feature"');
  process.exit(1);
}

if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Error: bump must be patch, minor, or major (got: ${bump})`);
  process.exit(1);
}

// Generate a random ID for the changeset file (like changesets does)
const id = randomBytes(8).toString('hex');
const filename = `${bump}-${id}.md`;

// Changeset format
const content = `---
"tryscript": ${bump}
---

${summary}
`;

const changesetDir = join(process.cwd(), '.changeset');
const filepath = join(changesetDir, filename);

// Ensure .changeset directory exists
mkdirSync(changesetDir, { recursive: true });

writeFileSync(filepath, content);

console.log(`Created changeset: .changeset/${filename}`);
console.log(`  Package: tryscript`);
console.log(`  Bump: ${bump}`);
console.log(`  Target version: ${version}`);
console.log(`  Summary: ${summary}`);
