/**
 * Test file discovery.
 */

import { readdir, realpath, stat } from 'node:fs';
import type { Dirent, Stats } from 'node:fs';
import { win32 } from 'node:path';
import { expandBraces, findUnsupportedSyntax, isStaticSegment, PathMatcher } from './glob.js';

/** Directories never searched for test files. */
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist']);

/**
 * Most filesystem calls in flight at once. libuv runs them on a small thread pool, so this
 * bounds queued work and memory on large trees rather than adding parallelism.
 */
const MAX_CONCURRENT_FS_CALLS = 32;

const isWindows = process.platform === 'win32';

/** A pattern resolved to the absolute static directory it starts from. */
interface Resolved {
  /** Filesystem root of the pattern, ending in `/`. */
  root: string;
  /** Absolute directory holding every path the pattern can match, ending in `/`. */
  base: string;
  /** Segments below `base`; never empty. */
  rest: string[];
  /** Whether the pattern itself names the last directory of `base`, as `fixtures/**` does. */
  namesBase: boolean;
}

/** A `!pattern` exclusion. */
interface Negation {
  /** Absolute base for a negation resolved from cwd; undefined for one starting with `**`. */
  base: string | undefined;
  matcher: PathMatcher;
  /** Whether it excludes whole directories: its last segment is `**` or a literal name. */
  prunes: boolean;
  /**
   * Whether it may exclude its own base directory. `!fixtures/**` excludes `fixtures`, but
   * `!**` and `!./**` exclude only what lies below cwd, so a dot directory a pattern names
   * stays searchable.
   */
  namesBase: boolean;
}

/** Positive patterns sharing one static base, crawled together. */
interface Crawl {
  base: string;
  /** Directory that `node_modules`, `dist`, and `**` negations are measured from. */
  frame: string;
  alternatives: string[][];
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

/** The names of `path` below `base`, `[]` for `base` itself, or undefined outside it. */
function namesBelow(path: string, base: string): string[] | undefined {
  if (`${path}/` === base) {
    return [];
  }
  return path.startsWith(base) ? path.slice(base.length).split('/') : undefined;
}

/** Every directory from the root down to `dir` (which ends in `/`), without trailing `/`. */
function directoryPrefixes(dir: string, root: string): string[] {
  const prefixes: string[] = [];
  for (let i = dir.indexOf('/', root.length); i !== -1; i = dir.indexOf('/', i + 1)) {
    prefixes.push(dir.slice(0, i));
  }
  return prefixes;
}

/**
 * Resolve a pattern against cwd. Empty and `.` segments are dropped and `..` removes the
 * segment before it, as path normalization would, so `../x` climbs above cwd. cwd segments are
 * literal even when they contain glob characters; the base ends at the first pattern segment
 * with glob syntax, and the last segment always stays in `rest`.
 *
 * @returns undefined when the pattern resolves to a filesystem root.
 */
function resolvePattern(body: string, cwd: string): Resolved | undefined {
  const absolute = isAbsolutePattern(body);
  const root = rootOf(absolute ? body : cwd);
  const start = absolute ? [] : cwd.slice(root.length).split('/');
  const segments: { text: string; literal: boolean }[] = [];
  const parts = [
    ...start.map((text) => ({ text, literal: true })),
    ...(absolute ? body.slice(root.length) : body).split('/').map((text) => ({
      text,
      literal: false,
    })),
  ];
  for (const part of parts) {
    if (part.text === '' || part.text === '.') {
      continue;
    }
    if (part.text === '..' && !part.literal) {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  if (segments.length === 0) {
    return undefined;
  }
  let staticCount = 0;
  while (staticCount < segments.length - 1) {
    const segment = segments[staticCount];
    if (segment === undefined || !(segment.literal || isStaticSegment(segment.text))) {
      break;
    }
    staticCount++;
  }
  const baseNames = segments.slice(0, staticCount).map((s) => s.text);
  return {
    root,
    base: baseNames.length === 0 ? root : `${root}${baseNames.join('/')}/`,
    rest: segments.slice(staticCount).map((s) => s.text),
    namesBase: staticCount > 0 && segments[staticCount - 1]?.literal === false,
  };
}

/** Last segment `**` or a literal name. */
function prunesDirectories(segments: readonly string[]): boolean {
  const last = segments.at(-1) ?? '';
  return last === '**' || isStaticSegment(last);
}

/** Whether a pattern has syntax that makes its literal text differ from what it matches. */
function hasGlobSyntax(pattern: string): boolean {
  return /[*?[{\\]/.test(pattern);
}

/** A segment that matches exactly its own text. */
function escapeSegment(text: string): string {
  return text.replace(/[*?[\\]/g, '\\$&');
}

/** Errors that mean a literal path names no file, rather than that it could not be read. */
const NOT_A_FILE = new Set(['ENOENT', 'ENOTDIR', 'EINVAL', 'ENAMETOOLONG']);

/** Characters no Windows file name contains, so a literal path holding one names no file. */
const WINDOWS_INVALID_NAME = /[*?"<>|]/;

/** A semaphore bounding concurrent filesystem calls. */
function createLimiter(max: number): <T>(run: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(run: () => Promise<T>): Promise<T> => {
    if (active < max) {
      active++;
    } else {
      // A released slot passes straight to the next waiter, so `active` stays accurate.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) {
        next();
      } else {
        active--;
      }
    }
  };
}

/**
 * A directory on one crawl branch. Real paths are known only for the crawl base and for
 * directories reached through a link; any other directory's real path extends its parent's,
 * so it is derived only when a link has to be checked for a cycle.
 */
interface Ancestry {
  name: string;
  parent: Ancestry | undefined;
  /** Real path ending in `/`, for a directory reached through a link. */
  real: string | undefined;
}

/** Real path, ending in `/`, of a directory on the branch. */
function realPathOf(node: Ancestry, realBase: string): string {
  const names: string[] = [];
  let current: Ancestry | undefined = node;
  while (current && current.real === undefined) {
    if (current.parent) {
      names.push(current.name);
    }
    current = current.parent;
  }
  const start = current?.real ?? realBase;
  return names.reverse().reduce((path, name) => `${path}${name}/`, start);
}

/** Whether a link target is a directory on the branch, or the base or one above it. */
function isAncestor(
  target: string,
  node: Ancestry,
  realBase: string,
  above: ReadonlySet<string>,
): boolean {
  if (above.has(target)) {
    return true;
  }
  for (let current: Ancestry | undefined = node; current; current = current.parent) {
    if (realPathOf(current, realBase) === target) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve glob patterns to the absolute paths of matching files, sorted by ordinal
 * comparison so reports and --fail-fast selection do not depend on traversal order.
 *
 * Relative patterns and negations (`!pattern`) resolve from `cwd`; a negation starting with
 * `**` excludes matches at any depth below the directory its positive pattern is searched
 * from. A negation ending in `**` or a literal name excludes the whole directory it names
 * without reading it. Only files are returned, so a pattern naming a directory matches
 * nothing. `node_modules` and `dist` directories are skipped below the deepest directory
 * containing both `cwd` and the pattern's static base. Symbolic links are followed, and
 * matches are reported at their link paths. A pattern that is literally the path of an
 * existing file also matches that file, even when it contains glob characters.
 *
 * @throws When a pattern uses unsupported syntax, or a directory that could hold matches
 *   cannot be read for any reason other than having been removed (ENOENT).
 */
export async function findTestFiles(
  patterns: string[],
  cwd: string = process.cwd(),
): Promise<string[]> {
  const cwdSlashed = toSlashes(cwd).replace(/\/?$/, '/');
  const crawls = new Map<string, Crawl>();
  const literals: Resolved[] = [];
  const negations: Negation[] = [];
  /** Directory that `node_modules`, `dist`, and `**` negations are measured from. */
  const frameFor = (dir: string, root: string): string =>
    rootOf(cwdSlashed) === root ? commonDirectory(cwdSlashed, dir) : root;

  for (const pattern of patterns) {
    const negated = pattern.startsWith('!') && !pattern.startsWith('!(');
    const body = negated ? pattern.slice(1) : pattern;
    if (body === '') {
      continue;
    }
    const unsupported = findUnsupportedSyntax(body);
    if (unsupported) {
      throw new Error(
        `Test pattern "${pattern}" uses ${unsupported.syntax}, which tryscript does not ` +
          `support. ${unsupported.hint}`,
      );
    }
    for (const alternative of expandBraces(body)) {
      if (negated && (alternative === '**' || alternative.startsWith('**/'))) {
        const segments = alternative.split('/').filter((s) => s !== '' && s !== '.');
        negations.push({
          base: undefined,
          matcher: new PathMatcher([segments]),
          prunes: prunesDirectories(segments),
          namesBase: false,
        });
        continue;
      }
      const resolved = resolvePattern(alternative, cwdSlashed);
      if (!resolved) {
        continue;
      }
      if (negated) {
        negations.push({
          base: resolved.base,
          matcher: new PathMatcher([resolved.rest]),
          prunes: prunesDirectories(resolved.rest),
          namesBase: resolved.namesBase,
        });
        continue;
      }
      const crawl = crawls.get(resolved.base) ?? {
        base: resolved.base,
        frame: frameFor(resolved.base, resolved.root),
        alternatives: [],
      };
      crawl.alternatives.push(resolved.rest);
      crawls.set(resolved.base, crawl);
    }
    // picomatch matched a path equal to the pattern text before compiling it, so a
    // shell-expanded name such as `test[1].tryscript.md` still selects, or excludes, itself.
    const literal = hasGlobSyntax(body) ? resolvePattern(body, cwdSlashed) : undefined;
    if (literal && negated) {
      negations.push({
        base: literal.base,
        matcher: new PathMatcher([literal.rest.map(escapeSegment)]),
        prunes: true,
        namesBase: literal.namesBase,
      });
    } else if (literal) {
      literals.push(literal);
    }
  }

  const isPruned = (dir: string, frame: string): boolean =>
    negations.some((n) => {
      if (!n.prunes) {
        return false;
      }
      const names = namesBelow(dir, n.base ?? frame);
      if (names === undefined || (names.length === 0 && !n.namesBase)) {
        return false;
      }
      return n.matcher.matches(names);
    });
  const matchesNegation = (file: string, frame: string): boolean =>
    negations.some((n) => {
      const names = namesBelow(file, n.base ?? frame);
      return names !== undefined && n.matcher.matches(names);
    });
  /** Whether `dir`, or a directory above it, is skipped: ignored by name or pruned. */
  const isExcludedDirectory = (dir: string, root: string, frame: string): boolean => {
    for (const prefix of directoryPrefixes(dir, root)) {
      const below = namesBelow(prefix, frame);
      const name = prefix.slice(prefix.lastIndexOf('/') + 1);
      if (below !== undefined && below.length > 0 && IGNORED_DIRECTORIES.has(name)) {
        return true;
      }
      if (isPruned(prefix, frame)) {
        return true;
      }
    }
    return false;
  };

  const limit = createLimiter(MAX_CONCURRENT_FS_CALLS);
  const readErrors = new Map<string, NodeJS.ErrnoException>();
  const record = (error: NodeJS.ErrnoException, path: string): void => {
    if (error.code !== 'ENOENT' && !readErrors.has(path)) {
      readErrors.set(path, error);
    }
  };
  const call = <T>(
    start: (callback: (error: NodeJS.ErrnoException | null, value: T) => void) => void,
  ) =>
    limit(
      () =>
        new Promise<{ error: NodeJS.ErrnoException | null; value: T }>((resolve) => {
          start((error, value) => {
            resolve({ error, value });
          });
        }),
    );
  const matches = new Set<string>();

  const crawl = async ({ base, frame, alternatives }: Crawl): Promise<void> => {
    const root = rootOf(base);
    if (isExcludedDirectory(base, root, frame)) {
      return;
    }
    const matcher = new PathMatcher(alternatives);
    // A link back to the base, or to a directory above it, would repeat the crawl forever.
    // Resolving the base costs a call, so it waits for the first link that needs it.
    let resolvedBase: Promise<{ real: string; above: Set<string> } | undefined> | undefined;
    const resolveBase = (): Promise<{ real: string; above: Set<string> } | undefined> => {
      resolvedBase ??= call<string>((done) => {
        realpath(base, done);
      }).then(({ error, value }) => {
        if (error) {
          record(error, base);
          return undefined;
        }
        const real = `${toSlashes(value).replace(/\/$/, '')}/`;
        const above = new Set([
          rootOf(real),
          ...directoryPrefixes(real, rootOf(real)).map((p) => `${p}/`),
        ]);
        return { real, above };
      });
      return resolvedBase;
    };

    /** Follow a link; a broken or unresolvable link is skipped, as fdir skipped it. */
    const followLink = async (
      path: string,
      next: number[],
      here: Ancestry,
      name: string,
    ): Promise<void> => {
      const target = await call<string>((done) => {
        realpath(path, done);
      });
      const info = target.error
        ? undefined
        : await call<Stats>((done) => {
            stat(target.value, done);
          });
      if (!info || info.error) {
        return;
      }
      if (info.value.isFile()) {
        considerFile(path, next);
        return;
      }
      if (!info.value.isDirectory() || !shouldDescend(path, next, name)) {
        return;
      }
      const resolved = await resolveBase();
      const real = `${toSlashes(target.value).replace(/\/$/, '')}/`;
      if (resolved && !isAncestor(real, here, resolved.real, resolved.above)) {
        await visit(`${path}/`, next, { name, parent: here, real });
      }
    };

    const considerFile = (path: string, next: number[]): void => {
      if (matcher.accepts(next) && !matchesNegation(path, frame)) {
        matches.add(path);
      }
    };

    const shouldDescend = (path: string, next: number[], name: string): boolean =>
      matcher.canDescend(next) && !IGNORED_DIRECTORIES.has(name) && !isPruned(path, frame);

    const visit = async (dir: string, states: number[], here: Ancestry): Promise<void> => {
      const listed = await call<Dirent[]>((done) => {
        readdir(dir, { withFileTypes: true }, done);
      });
      if (listed.error) {
        record(listed.error, dir);
        return;
      }
      const pending: Promise<void>[] = [];
      for (const entry of listed.value) {
        const next = matcher.step(states, entry.name);
        if (next.length === 0) {
          continue;
        }
        const path = `${dir}${entry.name}`;
        if (entry.isFile()) {
          considerFile(path, next);
        } else if (entry.isDirectory()) {
          if (shouldDescend(path, next, entry.name)) {
            const child: Ancestry = { name: entry.name, parent: here, real: undefined };
            pending.push(visit(`${path}/`, next, child));
          }
        } else if (entry.isSymbolicLink()) {
          pending.push(followLink(path, next, here, entry.name));
        }
      }
      await Promise.all(pending);
    };
    await visit(base, matcher.initial(), { name: '', parent: undefined, real: undefined });
  };

  const checkLiteral = async ({ root, base, rest }: Resolved): Promise<void> => {
    const path = `${base}${rest.join('/')}`;
    const dir = path.slice(0, path.lastIndexOf('/') + 1);
    if (isWindows && WINDOWS_INVALID_NAME.test(path.slice(root.length))) {
      return;
    }
    const frame = frameFor(dir, root);
    if (isExcludedDirectory(dir, root, frame) || matchesNegation(path, frame)) {
      return;
    }
    const info = await call<Stats>((done) => {
      stat(path, done);
    });
    if (info.error) {
      if (!NOT_A_FILE.has(info.error.code ?? '')) {
        record(info.error, path);
      }
      return;
    }
    if (info.value.isFile()) {
      matches.add(path);
    }
  };

  await Promise.all([...[...crawls.values()].map(crawl), ...literals.map(checkLiteral)]);

  const failed = [...readErrors.keys()].sort();
  const firstPath = failed[0];
  const first = firstPath === undefined ? undefined : readErrors.get(firstPath);
  if (firstPath !== undefined && first) {
    const others = failed.length > 1 ? ` (and ${failed.length - 1} more)` : '';
    throw new Error(
      `Test discovery could not read ${firstPath.replace(/[\\/]$/, '')}: ` +
        `${first.code ?? first.message}${others}. ` +
        'Fix its permissions or narrow the test patterns.',
      { cause: first },
    );
  }
  return [...matches].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
