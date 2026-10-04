/**
 * Resolution of `requires:` commands against a test file's composed PATH.
 */

import { accessSync, constants, statSync } from 'node:fs';
import { extname, join, posix, win32 } from 'node:path';

/** Windows default when PATHEXT is unset, matching cmd.exe. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

export interface ResolveOptions {
  platform?: NodeJS.Platform;
  /** PATHEXT value; used only on Windows. */
  pathext?: string;
}

/**
 * The directories a shell searches for a PATH, in order. A relative or empty element is
 * read from the session's working directory, as the shell reads it; when that directory
 * is not known yet (a sandbox), such elements are left out.
 */
export function searchDirectories(
  pathEntries: string[],
  cwd: string | null,
  options: ResolveOptions = {},
): string[] {
  const paths = (options.platform ?? process.platform) === 'win32' ? win32 : posix;
  return pathEntries.flatMap((entry) => {
    if (entry !== '' && paths.isAbsolute(entry)) {
      return [entry];
    }
    return cwd === null ? [] : [paths.resolve(cwd, entry)];
  });
}

/** True when `name` can be looked up on PATH: non-empty and without a path separator. */
export function isBareCommandName(name: string): boolean {
  return name !== '' && !/[\\/]/.test(name);
}

/** Errors meaning "nothing runnable at this path", as a shell lookup treats them. */
const NOT_RUNNABLE_CODES = new Set([
  'ENOENT',
  'ENOTDIR',
  'EACCES',
  'EPERM',
  'ELOOP',
  'ENAMETOOLONG',
]);

function isExecutableFile(candidate: string, windows: boolean): boolean {
  try {
    if (!statSync(candidate).isFile()) {
      return false;
    }
    // Windows has no execute bit; PATHEXT decides what runs.
    if (!windows) {
      accessSync(candidate, constants.X_OK);
    }
    return true;
  } catch (error) {
    // Anything else (EIO, EMFILE) is a fault to report, not a missing command.
    if (NOT_RUNNABLE_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      return false;
    }
    throw error;
  }
}

/**
 * Find the file a shell would run for `name`, searching `directories` in order (see
 * `searchDirectories`). On Windows, a name without a PATHEXT extension is tried with
 * each extension in turn.
 *
 * @returns The matching path, or `undefined` when no entry has it.
 */
export function resolveCommand(
  name: string,
  directories: string[],
  options: ResolveOptions = {},
): string | undefined {
  const windows = (options.platform ?? process.platform) === 'win32';
  const extensions = windows
    ? (options.pathext ?? process.env.PATHEXT ?? DEFAULT_PATHEXT)
        .split(';')
        .filter((ext) => ext !== '')
    : [];
  const hasKnownExtension = extensions.some(
    (ext) => ext.toLowerCase() === extname(name).toLowerCase(),
  );
  const candidates = windows
    ? [...(hasKnownExtension ? [name] : []), ...extensions.map((ext) => `${name}${ext}`)]
    : [name];

  for (const dir of directories) {
    for (const candidate of candidates) {
      const path = join(dir, candidate);
      if (isExecutableFile(path, windows)) {
        return path;
      }
    }
  }
  return undefined;
}

/**
 * Describe what is wrong with a raw `requires` value, or return `undefined` when it is
 * absent or a list of bare command names. Front matter is used as written even when it
 * fails validation, so the run checks it again before trusting it.
 */
export function requiresProblem(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    !value.every((entry): entry is string => typeof entry === 'string')
  ) {
    return 'requires must be a list of command names';
  }
  const path = value.find((entry) => !isBareCommandName(entry));
  return path === undefined
    ? undefined
    : `requires entry '${path}' must be a bare command name, not a path`;
}

/** A test file whose sessions will run, with the commands it requires. */
export interface RequiresTarget {
  filePath: string;
  /** Commands from the merged project and frontmatter config. */
  requires: string[];
  /** PATH elements its sessions will search, in order. */
  pathEntries: string[];
  /** The sessions' working directory, or `null` for a sandbox. */
  cwd: string | null;
  /** Number of sessions (blocks) that will run. */
  sessions: number;
}

export interface CommandResolution {
  command: string;
  path: string;
  files: number;
  sessions: number;
}

export interface RequiresFailure {
  filePath: string;
  command: string;
  searched: string[];
}

/**
 * Resolve every required command for every file. Resolutions are grouped by command and
 * resolved path, so a command that lands in different places for different files is
 * reported once per location.
 */
export function preflightRequires(
  targets: RequiresTarget[],
  options: ResolveOptions = {},
): { resolutions: CommandResolution[]; failures: RequiresFailure[] } {
  const resolutions = new Map<string, CommandResolution>();
  const failures: RequiresFailure[] = [];

  for (const target of targets) {
    for (const command of target.requires) {
      const directories = searchDirectories(target.pathEntries, target.cwd, options);
      const path = resolveCommand(command, directories, options);
      if (path === undefined) {
        failures.push({ filePath: target.filePath, command, searched: directories });
        continue;
      }
      const key = `${command}\0${path}`;
      const entry = resolutions.get(key) ?? { command, path, files: 0, sessions: 0 };
      entry.files++;
      entry.sessions += target.sessions;
      resolutions.set(key, entry);
    }
  }

  return { resolutions: [...resolutions.values()], failures };
}
