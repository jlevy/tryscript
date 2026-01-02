import { execSync } from 'node:child_process';
import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

/**
 * Get version string with git info for dev builds.
 * Format: X.Y.Z-dev.N.hash (or just X.Y.Z for tagged releases)
 */
function getGitVersion(): string {
  try {
    const git = (args: string) =>
      execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    const tag = git('describe --tags --abbrev=0');
    const tagVersion = tag.replace(/^v/, '');
    const [major, minor, patch] = tagVersion.split('.').map(Number);
    const commitsSinceTag = parseInt(git(`rev-list ${tag}..HEAD --count`), 10);
    const hash = git('rev-parse --short=7 HEAD');

    let dirty = false;
    try {
      git('diff --quiet');
      git('diff --cached --quiet');
    } catch {
      dirty = true;
    }

    if (commitsSinceTag === 0 && !dirty) {
      return tagVersion;
    }

    const bumpedPatch = (patch ?? 0) + 1;
    const suffix = dirty ? `${hash}-dirty` : hash;
    return `${major}.${minor}.${bumpedPatch}-dev.${commitsSinceTag}.${suffix}`;
  } catch {
    return pkg.version;
  }
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  dts: true,
  clean: true,
  define: {
    __VERSION__: JSON.stringify(getGitVersion()),
  },
  banner: ({ fileName }: { fileName: string }) =>
    fileName.startsWith('bin.') ? '#!/usr/bin/env node\n' : '',
});
