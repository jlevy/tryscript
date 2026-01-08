#!/usr/bin/env node
/* global process, console */
/**
 * Convert LCOV file to coverage-summary.json format
 * Usage: node lcov-to-json-summary.mjs <lcov-file> <output-json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const [lcovPath, outputPath] = process.argv.slice(2);

if (!lcovPath || !outputPath) {
  console.error('Usage: node lcov-to-json-summary.mjs <lcov-file> <output-json>');
  process.exit(1);
}

const lcov = readFileSync(lcovPath, 'utf8');
const files = {};
let currentFile = null;

const totals = {
  lines: { total: 0, covered: 0 },
  statements: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
};

// Parse LCOV
for (const line of lcov.split('\n')) {
  if (line.startsWith('SF:')) {
    currentFile = line.slice(3);
    files[currentFile] = {
      lines: { total: 0, covered: 0 },
      statements: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
    };
  } else if (line.startsWith('DA:') && currentFile) {
    // Line data: DA:line_number,hit_count
    const [, count] = line.slice(3).split(',');
    files[currentFile].lines.total++;
    files[currentFile].statements.total++;
    totals.lines.total++;
    totals.statements.total++;
    if (parseInt(count) > 0) {
      files[currentFile].lines.covered++;
      files[currentFile].statements.covered++;
      totals.lines.covered++;
      totals.statements.covered++;
    }
  } else if (line.startsWith('FNF:') && currentFile) {
    // Functions found
    const count = parseInt(line.slice(4));
    files[currentFile].functions.total = count;
    totals.functions.total += count;
  } else if (line.startsWith('FNH:') && currentFile) {
    // Functions hit
    const count = parseInt(line.slice(4));
    files[currentFile].functions.covered = count;
    totals.functions.covered += count;
  } else if (line.startsWith('BRF:') && currentFile) {
    // Branches found
    const count = parseInt(line.slice(4));
    files[currentFile].branches.total = count;
    totals.branches.total += count;
  } else if (line.startsWith('BRH:') && currentFile) {
    // Branches hit
    const count = parseInt(line.slice(4));
    files[currentFile].branches.covered = count;
    totals.branches.covered += count;
  }
}

// Calculate percentages
function withPct(obj) {
  return {
    total: obj.total,
    covered: obj.covered,
    skipped: 0,
    pct: obj.total > 0 ? parseFloat(((obj.covered / obj.total) * 100).toFixed(2)) : 100,
  };
}

// Build output
const summary = {
  total: {
    lines: withPct(totals.lines),
    statements: withPct(totals.statements),
    functions: withPct(totals.functions),
    branches: withPct(totals.branches),
    branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 100 },
  },
};

for (const [file, data] of Object.entries(files)) {
  summary[file] = {
    lines: withPct(data.lines),
    statements: withPct(data.statements),
    functions: withPct(data.functions),
    branches: withPct(data.branches),
  };
}

// Write output
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(summary, null, 2));

console.log(`Coverage summary written to ${outputPath}`);
console.log(
  `Total: ${summary.total.lines.pct}% lines, ${summary.total.statements.pct}% statements, ${summary.total.functions.pct}% functions, ${summary.total.branches.pct}% branches`,
);
