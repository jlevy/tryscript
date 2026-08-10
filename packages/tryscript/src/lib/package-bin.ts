import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

function findAncestorContaining(startDir: string, entryName: string): string | null {
  let dir = startDir;
  let parent = dirname(dir);

  while (dir !== parent) {
    if (existsSync(join(dir, entryName))) {
      return dir;
    }
    dir = parent;
    parent = dirname(dir);
  }

  return existsSync(join(dir, entryName)) ? dir : null;
}

/**
 * Find nearest package.json by walking up from startDir.
 * Returns the path to package.json, or null if not found.
 */
export function findPackageJson(startDir: string): string | null {
  const packageDir = findAncestorContaining(startDir, 'package.json');
  return packageDir === null ? null : join(packageDir, 'package.json');
}

/**
 * Find nearest .git directory by walking up from startDir.
 * Returns the directory containing .git, or null if not found.
 */
export function findGitRoot(startDir: string): string | null {
  return findAncestorContaining(startDir, '.git');
}
