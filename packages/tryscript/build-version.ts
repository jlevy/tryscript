import { execFileSync } from 'node:child_process';

type GitRunner = (args: readonly string[]) => string;

const VERSION_TAG_REGEX = /^v?(\d+)\.(\d+)\.(\d+)$/;
const COMMIT_COUNT_REGEX = /^\d+$/;
const SHORT_HASH_REGEX = /^[0-9a-f]{7,}$/i;

function runGit(args: readonly string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/** Derive a release or development version from repository state. */
export function getGitVersion(packageVersion: string, git: GitRunner = runGit): string {
  try {
    const tag = git(['describe', '--tags', '--abbrev=0']);
    const versionMatch = VERSION_TAG_REGEX.exec(tag);
    if (!versionMatch) {
      throw new Error(`Git tag is not a semantic version: ${tag}`);
    }

    const major = Number(versionMatch[1]);
    const minor = Number(versionMatch[2]);
    const patch = Number(versionMatch[3]);
    const commitCount = git(['rev-list', `${tag}..HEAD`, '--count']);
    if (!COMMIT_COUNT_REGEX.test(commitCount)) {
      throw new Error(`Git returned an invalid commit count: ${commitCount}`);
    }
    const commitsSinceTag = Number(commitCount);

    const hash = git(['rev-parse', '--short=7', 'HEAD']);
    if (!SHORT_HASH_REGEX.test(hash)) {
      throw new Error(`Git returned an invalid commit hash: ${hash}`);
    }
    const dirty = git(['status', '--porcelain']).length > 0;

    if (commitsSinceTag === 0 && !dirty) {
      return `${major}.${minor}.${patch}`;
    }

    const suffix = dirty ? `${hash}-dirty` : hash;
    return `${major}.${minor}.${patch + 1}-dev.${commitsSinceTag}.${suffix}`;
  } catch {
    return packageVersion;
  }
}
