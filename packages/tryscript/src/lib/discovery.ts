/**
 * Test file discovery.
 */

import { readdir } from 'node:fs';
import type { Dirent } from 'node:fs';
import { win32 } from 'node:path';
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
  const segments = (absolute ? body.slice(root.length) : body).split('/');

  let staticCount = 0;
  while (staticCount < segments.length - 1) {
    const segment = segments[staticCount] ?? '';
    if (segment.includes('\\') || isDynamicPattern(segment)) {
      break;
    }
    staticCount++;
  }
  const startParts = start.slice(root.length).split('/');
  return {
    negated,
    root,
    base: joinUnder(root, [...startParts, ...segments.slice(0, staticCount)]),
    rest: segments.slice(staticCount).join('/'),
  };
}

/**
 * Resolve `.` and `..` segments below `root`, keeping the root intact. `posix.join` would
 * collapse a UNC root (`//server/share/`) to `/server/share/`.
 *
 * @returns An absolute directory ending in `/`.
 */
function joinUnder(root: string, parts: string[]): string {
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.length === 0 ? root : `${root}${stack.join('/')}/`;
}

/**
 * A `readdir` that records failures. fdir, which tinyglobby crawls with, drops readdir
 * errors, so an unreadable directory would silently remove its tests from the run.
 * fast-glob, used through v0.2.1, failed instead, ignoring only ENOENT (a directory
 * removed mid-crawl).
 */
function recordingReaddir(errors: NodeJS.ErrnoException[]): typeof readdir {
  const recording = (
    path: string,
    options: { withFileTypes: true },
    callback: (error: NodeJS.ErrnoException | null, entries: Dirent[]) => void,
  ): void => {
    readdir(path, options, (error, entries) => {
      if (error && error.code !== 'ENOENT') {
        errors.push(error);
      }
      callback(error, entries);
    });
  };
  // fdir calls only this (path, { withFileTypes: true }, callback) form; `readdir`'s
  // remaining overloads cannot be implemented by one function, hence the single cast.
  return recording as unknown as typeof readdir;
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
 * containing both `cwd` and the pattern's static base, so a pattern under `cwd` is
 * filtered exactly as fast-glob filtered it.
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
  const readErrors: NodeJS.ErrnoException[] = [];

  // tinyglobby 0.2.17 matches paths relative to its own cwd, so a pattern rooted above
  // that cwd (`../**/x`, or an absolute pattern) cannot match files inside it. Each
  // pattern is therefore globbed on its own from a directory at or above its base. One
  // call per pattern also keeps tinyglobby from listing directories between patterns'
  // bases, which fast-glob never read.
  const globOne = (p: ResolvedPattern, extra: string[]): Promise<string[]> => {
    const ancestor = rootOf(cwdSlashed) === p.root ? commonDirectory(cwdSlashed, p.base) : p.root;
    return glob([`${escapePath(p.base.slice(ancestor.length))}${p.rest}`, ...extra], {
      cwd: ancestor,
      ignore: IGNORED,
      absolute: true,
      dot: false,
      // tinyglobby expands a directory pattern into its contents by default; fast-glob,
      // which tryscript used through v0.2.1, never did.
      expandDirectories: false,
      fs: { readdir: recordingReaddir(readErrors) },
    });
  };

  const matches = new Set<string>();
  for (const p of resolved.filter((r) => !r.negated)) {
    for (const file of await globOne(p, anywhere)) {
      matches.add(file);
    }
  }
  // A negation removes exactly the files it would match as a pattern of its own.
  for (const n of resolved.filter((r) => r.negated)) {
    for (const file of await globOne(n, [])) {
      matches.delete(file);
    }
  }

  const [first] = readErrors;
  if (first) {
    const others = readErrors.length > 1 ? ` (and ${readErrors.length - 1} more)` : '';
    throw new Error(
      `Test discovery could not read ${first.path?.replace(/[\\/]$/, '') ?? 'a directory'}: ` +
        `${first.code ?? first.message}${others}. ` +
        'Fix its permissions or narrow the test patterns.',
      { cause: first },
    );
  }
  return [...matches].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
