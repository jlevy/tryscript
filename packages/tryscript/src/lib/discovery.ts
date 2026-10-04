/**
 * Test file discovery.
 */

import { posix, win32 } from 'node:path';
import { escapePath, glob, isDynamicPattern } from 'tinyglobby';

/** Directories never searched for test files. */
const IGNORED = ['**/node_modules/**', '**/dist/**'];

const isWindows = process.platform === 'win32';

/** A pattern resolved to an absolute static directory plus the glob below it. */
interface ResolvedPattern {
  negated: boolean;
  root: string;
  /** Absolute directory holding every path the pattern can match, ending in `/`. */
  base: string;
  /** Pattern relative to `base`; never empty. */
  rest: string;
}

function toSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

function rootOf(absolute: string): string {
  return isWindows ? toSlashes(win32.parse(absolute).root) : '/';
}

function isAbsolutePattern(pattern: string): boolean {
  return isWindows ? win32.isAbsolute(pattern) : pattern.startsWith('/');
}

/**
 * Split a pattern into the absolute directory its static leading segments name and the
 * remainder. A segment is static when it has no glob syntax and no escape.
 */
function resolvePattern(pattern: string, cwd: string): ResolvedPattern {
  const negated = pattern.startsWith('!') && !pattern.startsWith('!(');
  const body = negated ? pattern.slice(1) : pattern;
  // cwd is a literal directory, so only the pattern's own segments are scanned for globs.
  const absolute = isAbsolutePattern(body);
  const root = rootOf(absolute ? body : cwd);
  const start = absolute ? root : cwd;
  const segments = body.slice(absolute ? root.length : 0).split('/');

  let staticCount = 0;
  while (staticCount < segments.length - 1) {
    const segment = segments[staticCount] ?? '';
    if (segment.includes('\\') || isDynamicPattern(segment)) {
      break;
    }
    staticCount++;
  }
  const base = posix.join(start, ...segments.slice(0, staticCount));
  return {
    negated,
    root,
    base: base.endsWith('/') ? base : `${base}/`,
    rest: segments.slice(staticCount).join('/'),
  };
}

/** Deepest directory containing both paths; each ends in `/`. */
function commonDirectory(a: string, b: string): string {
  const aParts = a.split('/');
  const bParts = b.split('/');
  let i = 0;
  while (i < aParts.length - 1 && i < bParts.length - 1 && aParts[i] === bParts[i]) {
    i++;
  }
  return `${aParts.slice(0, i).join('/')}/`;
}

/**
 * Resolve glob patterns to the absolute paths of matching files, sorted by ordinal
 * comparison so reports and --fail-fast selection do not depend on traversal order.
 *
 * Relative patterns and negations (`!pattern`) resolve from `cwd`, except that a
 * negation starting with `**` excludes matches at any depth, as it did with fast-glob.
 * A pattern naming a directory matches nothing; only files are returned.
 * `node_modules` and `dist` directories are skipped below the deepest directory
 * containing `cwd` and every pattern's static base.
 */
export async function findTestFiles(
  patterns: string[],
  cwd: string = process.cwd(),
): Promise<string[]> {
  const cwdSlashed = toSlashes(cwd).replace(/\/?$/, '/');
  const isAnywhereNegation = (p: string): boolean => p === '!**' || p.startsWith('!**/');
  const anywhere = patterns.filter(isAnywhereNegation);
  const resolved = patterns
    .filter((p) => p !== '' && !isAnywhereNegation(p))
    .map((p) => resolvePattern(p, cwdSlashed));

  // tinyglobby 0.2.17 matches paths relative to its own cwd, so a pattern rooted above
  // that cwd (`../**/x`, or an absolute pattern) cannot match files inside it. Globbing
  // from a common ancestor keeps every pattern at or below the cwd tinyglobby sees.
  const matches = new Set<string>();
  for (const root of new Set(resolved.filter((p) => !p.negated).map((p) => p.root))) {
    const group = resolved.filter((p) => p.root === root);
    let ancestor = rootOf(cwdSlashed) === root ? cwdSlashed : undefined;
    for (const p of group) {
      ancestor = ancestor === undefined ? p.base : commonDirectory(ancestor, p.base);
    }
    if (ancestor === undefined) {
      continue;
    }
    const relative = group.map((p) => {
      const prefix = escapePath(p.base.slice(ancestor.length));
      return `${p.negated ? '!' : ''}${prefix}${p.rest}`;
    });
    const found = await glob([...relative, ...anywhere], {
      cwd: ancestor,
      ignore: IGNORED,
      absolute: true,
      dot: false,
      // tinyglobby expands a directory pattern into its contents by default; fast-glob,
      // which tryscript used through v0.2.1, never did.
      expandDirectories: false,
    });
    for (const file of found) {
      matches.add(file);
    }
  }
  return [...matches].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
