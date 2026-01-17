import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Find nearest package.json by walking up from startDir.
 * Returns the path to package.json, or null if not found.
 */
export function findPackageJson(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      return pkgPath;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    } // Reached filesystem root
    dir = parent;
  }

  return null;
}

/**
 * Find nearest .git directory by walking up from startDir.
 * Returns the directory containing .git, or null if not found.
 */
export function findGitRoot(startDir: string): string | null {
  let dir = startDir;

  while (true) {
    const gitPath = join(dir, '.git');
    if (existsSync(gitPath)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    } // Reached filesystem root
    dir = parent;
  }

  return null;
}
