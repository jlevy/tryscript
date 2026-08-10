/** Replay the published v0.1.7 test corpus against the candidate package build. */

import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import stripAnsi from 'strip-ansi';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const baselineCommit = '1aa7ecd534f5739ead591e2361e2b2e7b9346c70';
const baselineTestPattern = 'packages/tryscript/tests/**/*.tryscript.md';
const expectedPassed = 110;
const expectedFailed = 14;
const expectedFailureFiles = [
  'packages/tryscript/tests/capture-log.tryscript.md',
  'packages/tryscript/tests/cli.tryscript.md',
  'packages/tryscript/tests/expand-validation.tryscript.md',
  'packages/tryscript/tests/expand.tryscript.md',
];
const expectedFailureNames = [
  'Capture log is written alongside test run',
  '--help shows usage information',
  'run --help shows run options',
  'docs command displays reference',
  'No test files found exits with code 1',
  'coverage --help shows coverage options',
  'Invalid argument shows error message',
  'coverage command requires arguments',
  'coverage command runs commands and generates report',
  'coverage command exits with failure when command fails',
  'Expand flags are mutually exclusive',
  'Expand and update are mutually exclusive',
  'Warning shown for unknown wildcards',
  'Expand unknown wildcards in a test file',
];
const expectedPathWarningSuffixes = [
  "packages/tryscript/tests/elisions.tryscript.md:bin: unknown config key 'bin'",
  "packages/tryscript/tests/unknown-wildcards.tryscript.md:bin: unknown config key 'bin'",
];
const expectedWildcardWarning =
  'Warning: 15 unknown wildcards found (??? or [??]). ' +
  'Run with --expand, then review the replacement before committing.';
// Git hooks export repository-local GIT_* variables. The archived baseline must
// discover only the temporary repository initialized below.
const isolatedGitEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
);

/**
 * Run a setup command that must succeed.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: isolatedGitEnvironment,
  });
  if (result.error) {
    throw new Error(`Failed to start ${command}`, { cause: result.error });
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${String(result.status)}:\n` +
        `${result.stdout}${result.stderr}`,
    );
  }
}

/**
 * @param {readonly string[]} values
 * @returns {string[]}
 */
function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

/**
 * @param {readonly string[]} actual
 * @param {readonly string[]} expected
 * @param {string} label
 */
function assertSameValues(actual, expected, label) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `Unexpected ${label}.\nExpected: ${JSON.stringify(expectedSorted)}\n` +
        `Actual: ${JSON.stringify(actualSorted)}`,
    );
  }
}

const tempRoot = await mkdtemp(join(tmpdir(), 'tryscript-v0-1-7-compat-'));
try {
  const archivePath = join(tempRoot, 'baseline.tar');
  const baselineRoot = join(tempRoot, 'baseline');
  await mkdir(baselineRoot);
  run(
    'git',
    ['archive', '--format=tar', `--output=${archivePath}`, baselineCommit],
    repositoryRoot,
  );
  run('tar', ['-xf', archivePath, '-C', baselineRoot], repositoryRoot);
  run('git', ['init', '--quiet'], baselineRoot);

  const baselinePackageRoot = join(baselineRoot, 'packages', 'tryscript');
  await Promise.all([
    cp(join(packageRoot, 'dist'), join(baselinePackageRoot, 'dist'), { recursive: true }),
    cp(join(packageRoot, 'README.md'), join(baselinePackageRoot, 'README.md')),
    mkdir(join(baselinePackageRoot, 'docs'), { recursive: true }).then(() =>
      cp(
        join(packageRoot, 'docs', 'tryscript-reference.md'),
        join(baselinePackageRoot, 'docs', 'tryscript-reference.md'),
      ),
    ),
  ]);
  await symlink(
    join(packageRoot, 'node_modules'),
    join(baselinePackageRoot, 'node_modules'),
    'dir',
  );

  const replay = spawnSync(
    process.execPath,
    [
      join(baselinePackageRoot, 'dist', 'bin.mjs'),
      'run',
      baselineTestPattern,
      '--quiet',
      '--no-diff',
    ],
    { cwd: baselineRoot, encoding: 'utf8', env: isolatedGitEnvironment },
  );
  if (replay.error) {
    throw new Error('Failed to start the v0.1.7 compatibility replay', { cause: replay.error });
  }

  const output = `${replay.stdout}${replay.stderr}`;
  const assertionOutput = stripAnsi(output);
  if (replay.status !== 1) {
    throw new Error(
      `Compatibility replay must exit 1 for the reviewed output changes; got ${String(replay.status)}:\n${output}`,
    );
  }

  const summary = /(\d+) passed, (\d+) failed \(/.exec(assertionOutput);
  if (
    summary === null ||
    Number(summary[1]) !== expectedPassed ||
    Number(summary[2]) !== expectedFailed
  ) {
    throw new Error(`Unexpected compatibility replay summary:\n${output}`);
  }

  const failureFiles = [...assertionOutput.matchAll(/^FAIL (.+)$/gm)].map(
    (match) => match[1] ?? '',
  );
  for (const [index, failureFile] of failureFiles.entries()) {
    const suffix = expectedFailureFiles[index];
    if (suffix === undefined || !failureFile.endsWith(suffix)) {
      throw new Error(`Unexpected compatibility failure file: ${failureFile}`);
    }
  }
  if (failureFiles.length !== expectedFailureFiles.length) {
    throw new Error(`Expected ${String(expectedFailureFiles.length)} failure files`);
  }

  const failureNames = [...assertionOutput.matchAll(/^ {2}✗ (.+)$/gm)].map(
    (match) => match[1] ?? '',
  );
  assertSameValues(failureNames, expectedFailureNames, 'compatibility failure names');

  const warnings = assertionOutput.split(/\r?\n/).filter((line) => line.startsWith('Warning:'));
  const pathWarnings = warnings.filter((line) => line.includes("unknown config key 'bin'"));
  for (const suffix of expectedPathWarningSuffixes) {
    if (!pathWarnings.some((line) => line.endsWith(suffix))) {
      throw new Error(`Missing reviewed compatibility warning: ${suffix}`);
    }
  }
  if (pathWarnings.length !== expectedPathWarningSuffixes.length) {
    throw new Error(`Unexpected config warnings:\n${pathWarnings.join('\n')}`);
  }
  if (warnings.length !== expectedPathWarningSuffixes.length + 1) {
    throw new Error(`Unexpected compatibility warnings:\n${warnings.join('\n')}`);
  }
  if (!warnings.includes(expectedWildcardWarning)) {
    throw new Error('Missing reviewed unknown-wildcard warning');
  }

  console.log(
    `v0.1.7 compatibility replay passed: ${String(expectedPassed)} assertions retained; ` +
      `${String(expectedFailed)} reviewed CLI output changes`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
