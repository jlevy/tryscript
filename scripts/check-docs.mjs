import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUIDELINE_FOOTER = 'This document follows common-doc-guidelines.md.';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string[]} */
function markdownFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md', '*.mdx'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  return [...new Set(output.split('\0').filter(Boolean))]
    .filter((file) => existsSync(resolve(repositoryRoot, file)))
    .sort();
}

/** @param {string} file */
function isMaintainedDocument(file) {
  if (file === 'README.md' || file === 'SUPPLY-CHAIN-SECURITY.md') {
    return true;
  }
  if (file.startsWith('examples/')) {
    return true;
  }
  if (!file.startsWith('docs/')) {
    return false;
  }

  return !file.startsWith('docs/general/') && !file.startsWith('docs/project/specs/done/');
}

/**
 * @typedef {object} MarkdownFence
 * @property {string} character
 * @property {number} length
 */

/**
 * @param {string} content
 * @returns {string[]}
 */
function visibleMarkdownLines(content) {
  /** @type {MarkdownFence | undefined} */
  let fence;

  return content.split('\n').map((line) => {
    if (fence === undefined) {
      const openingMarker = /^\s*(`{3,}|~{3,})/u.exec(line)?.[1];
      if (openingMarker !== undefined) {
        fence = { character: openingMarker.slice(0, 1), length: openingMarker.length };
        return '';
      }
    } else {
      const closingMarker = /^\s*(`{3,}|~{3,})\s*$/u.exec(line)?.[1];
      if (closingMarker?.slice(0, 1) === fence.character && closingMarker.length >= fence.length) {
        fence = undefined;
      }
      return '';
    }

    return line;
  });
}

/** @param {string} rawTarget */
function normalizeLinkTarget(rawTarget) {
  const withoutTitle =
    rawTarget
      .trim()
      .replace(/^<|>$/gu, '')
      .split(/\s+["']/u, 1)[0] ?? '';
  const localTarget = withoutTitle.split(/[?#]/u, 1)[0] ?? '';
  return decodeURIComponent(localTarget.replaceAll('\\ ', ' '));
}

const files = markdownFiles();
const errors = [];
let maintainedCount = 0;

for (const file of files) {
  const absoluteFile = resolve(repositoryRoot, file);
  const content = readFileSync(absoluteFile, 'utf8');
  const visibleLines = visibleMarkdownLines(content);

  if (isMaintainedDocument(file)) {
    maintainedCount += 1;
    const firstHeading = visibleLines.find((line) => /^#{1,6}\s/u.test(line));
    if (!firstHeading?.startsWith('# ')) {
      errors.push(`${file}: maintained documents must start their heading hierarchy at H1`);
    }
    if (!content.includes(GUIDELINE_FOOTER)) {
      errors.push(`${file}: missing the common-doc-guidelines footer`);
    }
  }

  for (const [index, line] of visibleLines.entries()) {
    const markdownLinks = line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu);
    for (const match of markdownLinks) {
      const rawTarget = match[1];
      if (rawTarget === undefined) {
        continue;
      }
      if (/^(?:https?:|mailto:|tel:|data:|#)/iu.test(rawTarget)) {
        continue;
      }

      let target;
      try {
        target = normalizeLinkTarget(rawTarget);
      } catch {
        errors.push(`${file}:${index + 1}: invalid encoded link target: ${rawTarget}`);
        continue;
      }
      if (target.length === 0) {
        continue;
      }

      const absoluteTarget = resolve(dirname(absoluteFile), target);
      if (!existsSync(absoluteTarget)) {
        errors.push(`${file}:${index + 1}: missing local link target: ${rawTarget}`);
      } else if (target.endsWith('/') && !statSync(absoluteTarget).isDirectory()) {
        errors.push(`${file}:${index + 1}: link target is not a directory: ${rawTarget}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(
  `Documentation checks passed (${files.length} Markdown files, ${maintainedCount} maintained).`,
);
