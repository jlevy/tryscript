import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';

export interface PackageBinEntry {
  /** Command name (what user types) */
  name: string;
  /** Absolute path to the binary file */
  path: string;
}

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
 * Parse package.json and extract bin entries.
 * Handles both string form ("bin": "./cli.js") and object form ("bin": {"name": "./cli.js"}).
 */
export function parsePackageBin(pkgJson: unknown, pkgDir: string): PackageBinEntry[] {
  const pkg = pkgJson as {
    name?: string;
    bin?: string | Record<string, string>;
  };

  if (!pkg.bin) {
    return [];
  }

  if (typeof pkg.bin === 'string') {
    // String form: use package name as command name
    const name = pkg.name?.replace(/^@[^/]+\//, '') ?? 'cli'; // Strip scope
    return [{ name, path: resolve(pkgDir, pkg.bin) }];
  }

  // Object form: explicit command names
  return Object.entries(pkg.bin).map(([name, relPath]) => ({
    name,
    path: resolve(pkgDir, relPath),
  }));
}

/**
 * Create executable wrapper scripts for bin entries.
 * Wrappers handle Node.js files specially (invoke with node).
 */
export async function createBinWrappers(bins: PackageBinEntry[], binDir: string): Promise<void> {
  await mkdir(binDir, { recursive: true });

  for (const bin of bins) {
    const wrapperPath = join(binDir, bin.name);
    const ext = extname(bin.path).toLowerCase();

    // Generate wrapper script
    // Node.js files need to be invoked with node
    // Other files (compiled binaries) can be executed directly
    const wrapper = ['.js', '.mjs', '.cjs'].includes(ext)
      ? `#!/bin/sh\nexec node "${bin.path}" "$@"\n`
      : `#!/bin/sh\nexec "${bin.path}" "$@"\n`;

    await writeFile(wrapperPath, wrapper, { mode: 0o755 });
  }
}

/**
 * Set up package bin wrappers and return the bin directory path.
 * Returns null if packageBin is false or no package.json found.
 */
export async function setupPackageBin(
  enabled: boolean | undefined,
  testDir: string,
  tempDir: string,
): Promise<string | null> {
  if (!enabled) {
    return null;
  }

  const pkgPath = findPackageJson(testDir);
  if (!pkgPath) {
    return null; // No package.json found, silently skip
  }

  const pkgDir = dirname(pkgPath);
  const pkgContent = await readFile(pkgPath, 'utf-8');
  const pkgJson = JSON.parse(pkgContent) as unknown;

  const bins = parsePackageBin(pkgJson, pkgDir);
  if (bins.length === 0) {
    return null; // No bin entries
  }

  const binDir = join(tempDir, '.bin');
  await createBinWrappers(bins, binDir);

  return binDir;
}
