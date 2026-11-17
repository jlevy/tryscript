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
 * Workers listing directories at once, each with one filesystem call in flight. libuv runs
 * the calls on a small thread pool, so this bounds queued work rather than adding parallelism.
 */
const DISCOVERY_WORKERS = 32;

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

/** Errors resolving a link that mean it is broken or loops, so it leads nowhere to search. */
const BROKEN_LINK = new Set(['ENOENT', 'ENOTDIR', 'ELOOP']);

/**
 * Most times one crawl enters the same directory through symbolic links. Links that fan out
 * to shared directories can otherwise multiply the work exponentially without any cycle.
 */
const MAX_LINK_PATHS_TO_DIRECTORY = 64;

/** A filesystem call's outcome, as a value so a failure can be recorded rather than thrown. */
interface Outcome<T> {
  error: NodeJS.ErrnoException | null;
  value: T;
}

function settle<T>(
  start: (callback: (error: NodeJS.ErrnoException | null, value: T) => void) => void,
): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    start((error, value) => {
      resolve({ error, value });
    });
  });
}

/**
 * A directory on one crawl branch. Real paths are known only for the crawl base and for
 * directories reached through a link; any other directory's real path extends its parent's,
 * so it is derived only when a link has to be checked.
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

/**
 * Whether the search is already inside a link's target: the target is, or contains, a
 * directory on the branch. Following it would search that directory again, or forever.
 */
function isInsideTarget(target: string, node: Ancestry, realBase: string): boolean {
  for (let current: Ancestry | undefined = node; current; current = current.parent) {
    if (realPathOf(current, realBase).startsWith(target)) {
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

  const readErrors = new Map<string, NodeJS.ErrnoException>();
  const record = (error: NodeJS.ErrnoException, path: string): void => {
    if (error.code !== 'ENOENT' && !readErrors.has(path)) {
      readErrors.set(path, error);
    }
  };
  const matches = new Set<string>();
  let fatal: Error | undefined;

  /** One crawl's matcher and link bookkeeping, shared by its queued directories. */
  interface CrawlState {
    base: string;
    frame: string;
    matcher: PathMatcher;
    realBase: Promise<string | undefined> | undefined;
    linkPaths: Map<string, number>;
  }
  type Task =
    | { kind: 'dir'; crawl: CrawlState; dir: string; states: number[]; here: Ancestry }
    | { kind: 'link'; crawl: CrawlState; path: string; states: number[]; here: Ancestry }
    | { kind: 'literal'; literal: Resolved };

  // A fixed pool of workers drains a queue of plain task records, so a wide directory costs
  // one small record per child rather than a pending promise per child.
  const queue: (Task | undefined)[] = [];
  let head = 0;
  let active = 0;
  let idle: (() => void)[] = [];
  const wakeAll = (): void => {
    const waiting = idle;
    idle = [];
    for (const wake of waiting) {
      wake();
    }
  };
  const enqueue = (task: Task): void => {
    queue.push(task);
    wakeAll();
  };
  const dequeue = (): Task | undefined => {
    const task = queue[head];
    queue[head] = undefined;
    head++;
    if (head > 1024 && head * 2 > queue.length) {
      queue.splice(0, head);
      head = 0;
    }
    return task;
  };

  const considerFile = (crawl: CrawlState, path: string, states: number[]): void => {
    if (crawl.matcher.accepts(states) && !matchesNegation(path, crawl.frame)) {
      matches.add(path);
    }
  };
  const shouldDescend = (crawl: CrawlState, path: string, states: number[]): boolean =>
    crawl.matcher.canDescend(states) &&
    !IGNORED_DIRECTORIES.has(path.slice(path.lastIndexOf('/') + 1)) &&
    !isPruned(path, crawl.frame);

  const listDirectory = async (
    crawl: CrawlState,
    dir: string,
    states: number[],
    here: Ancestry,
  ): Promise<void> => {
    const listed = await settle<Dirent[]>((done) => {
      readdir(dir, { withFileTypes: true }, done);
    });
    if (listed.error) {
      record(listed.error, dir);
      return;
    }
    for (const entry of listed.value) {
      const next = crawl.matcher.step(states, entry.name);
      if (next.length === 0) {
        continue;
      }
      const path = `${dir}${entry.name}`;
      if (entry.isFile()) {
        considerFile(crawl, path, next);
      } else if (entry.isDirectory()) {
        if (shouldDescend(crawl, path, next)) {
          const child: Ancestry = { name: entry.name, parent: here, real: undefined };
          enqueue({ kind: 'dir', crawl, dir: `${path}/`, states: next, here: child });
        }
      } else if (
        entry.isSymbolicLink() &&
        ((crawl.matcher.accepts(next) && !matchesNegation(path, crawl.frame)) ||
          shouldDescend(crawl, path, next))
      ) {
        // A link is resolved only if it could select a file or lead to one, so an excluded
        // link that cannot be resolved does not fail the run.
        enqueue({ kind: 'link', crawl, path, states: next, here });
      }
    }
  };

  /** Follow a link; a broken or looping one is skipped, as fdir skipped it. */
  const followLink = async (
    crawl: CrawlState,
    path: string,
    states: number[],
    here: Ancestry,
  ): Promise<void> => {
    const recordUnlessBroken = (error: NodeJS.ErrnoException): void => {
      if (!BROKEN_LINK.has(error.code ?? '')) {
        record(error, path);
      }
    };
    const target = await settle<string>((done) => {
      realpath(path, done);
    });
    if (target.error) {
      recordUnlessBroken(target.error);
      return;
    }
    const info = await settle<Stats>((done) => {
      stat(target.value, done);
    });
    if (info.error) {
      recordUnlessBroken(info.error);
      return;
    }
    const stats = info.value;
    if (stats.isFile()) {
      considerFile(crawl, path, states);
      return;
    }
    if (!stats.isDirectory() || !shouldDescend(crawl, path, states)) {
      return;
    }
    crawl.realBase ??= settle<string>((done) => {
      realpath(crawl.base, done);
    }).then(({ error, value }) => {
      if (error) {
        record(error, crawl.base);
        return undefined;
      }
      return `${toSlashes(value).replace(/\/$/, '')}/`;
    });
    const realBase = await crawl.realBase;
    const real = `${toSlashes(target.value).replace(/\/$/, '')}/`;
    if (realBase === undefined || isInsideTarget(real, here, realBase)) {
      return;
    }
    const count = (crawl.linkPaths.get(real) ?? 0) + 1;
    crawl.linkPaths.set(real, count);
    if (count > MAX_LINK_PATHS_TO_DIRECTORY) {
      fatal ??= new Error(
        `Test discovery reached ${real.replace(/\/$/, '')} through more than ` +
          `${MAX_LINK_PATHS_TO_DIRECTORY} symbolic-link paths. Remove links that fan out to ` +
          'the same directory, or narrow the test patterns.',
      );
      return;
    }
    const name = path.slice(path.lastIndexOf('/') + 1);
    enqueue({
      kind: 'dir',
      crawl,
      dir: `${path}/`,
      states,
      here: { name, parent: here, real },
    });
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
    const info = await settle<Stats>((done) => {
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

  const run = (task: Task): Promise<void> => {
    switch (task.kind) {
      case 'dir':
        return listDirectory(task.crawl, task.dir, task.states, task.here);
      case 'link':
        return followLink(task.crawl, task.path, task.states, task.here);
      case 'literal':
        return checkLiteral(task.literal);
    }
  };
  const worker = async (): Promise<void> => {
    for (;;) {
      if (fatal) {
        // Idle workers wait for new tasks; wake them so they see the failure and stop too.
        wakeAll();
        return;
      }
      const task = head < queue.length ? dequeue() : undefined;
      if (task) {
        active++;
        await run(task);
        active--;
        if (active === 0 && head >= queue.length) {
          wakeAll();
        }
        continue;
      }
      if (active === 0) {
        wakeAll();
        return;
      }
      await new Promise<void>((resolve) => idle.push(resolve));
    }
  };

  for (const { base, frame, alternatives } of crawls.values()) {
    if (isExcludedDirectory(base, rootOf(base), frame)) {
      continue;
    }
    const crawl: CrawlState = {
      base,
      frame,
      matcher: new PathMatcher(alternatives),
      realBase: undefined,
      linkPaths: new Map(),
    };
    const here: Ancestry = { name: '', parent: undefined, real: undefined };
    enqueue({ kind: 'dir', crawl, dir: base, states: crawl.matcher.initial(), here });
  }
  for (const literal of literals) {
    enqueue({ kind: 'literal', literal });
  }
  await Promise.all(Array.from({ length: DISCOVERY_WORKERS }, worker));
  if (fatal) {
    throw fatal;
  }

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
