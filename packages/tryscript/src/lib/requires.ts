/**
 * Resolution of `requires:` commands against a test file's composed PATH.
 */

import { accessSync, constants, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/** Windows default when PATHEXT is unset, matching cmd.exe. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

export interface ResolveOptions {
  platform?: NodeJS.Platform;
  /** PATHEXT value; used only on Windows. */
  pathext?: string;
}

/** True when `name` can be looked up on PATH: non-empty and without a path separator. */
export function isBareCommandName(name: string): boolean {
  return name !== '' && !/[\\/]/.test(name);
}

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
  } catch {
    return false;
  }
}

/**
 * Find the file a shell would run for `name`, searching `pathEntries` in order.
 *
 * Empty entries are skipped rather than read as the working directory, so a match is
 * always a directory the PATH names. On Windows, a name without a PATHEXT extension is
 * tried with each extension in turn.
 *
 * @returns The matching path, or `undefined` when no entry has it.
 */
export function resolveCommand(
  name: string,
  pathEntries: string[],
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

  for (const dir of pathEntries) {
    if (dir === '') {
      continue;
    }
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
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return 'requires must be a list of command names';
  }
  const path = (value as string[]).find((entry) => !isBareCommandName(entry));
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
      const path = resolveCommand(command, target.pathEntries, options);
      if (path === undefined) {
        failures.push({
          filePath: target.filePath,
          command,
          searched: target.pathEntries.filter((dir) => dir !== ''),
        });
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
