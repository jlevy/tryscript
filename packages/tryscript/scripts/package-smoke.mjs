/**
 * Pack the package, then exercise every published JavaScript entry point as a consumer.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'atomically';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersionPattern = /^(\d+\.\d+\.\d+.*|development)$/;

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      npm_config_ignore_scripts: 'true',
    },
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
  return result.stdout;
}

const tempRoot = await mkdtemp(join(tmpdir(), 'tryscript-package-smoke-'));
try {
  run('pnpm', ['pack', '--pack-destination', tempRoot], packageRoot);
  const archives = (await readdir(tempRoot)).filter((entry) => entry.endsWith('.tgz'));
  if (archives.length !== 1) {
    throw new Error(`Expected one packed archive, found ${String(archives.length)}`);
  }
  const archive = archives[0];
  if (archive === undefined) {
    throw new Error('Packed archive disappeared before extraction');
  }

  run('tar', ['-xzf', join(tempRoot, archive), '-C', tempRoot], packageRoot);
  const packedRoot = join(tempRoot, 'package');
  const packedManifest = /** @type {unknown} */ (
    JSON.parse(await readFile(join(packedRoot, 'package.json'), 'utf8'))
  );
  if (
    typeof packedManifest !== 'object' ||
    packedManifest === null ||
    !('dependencies' in packedManifest) ||
    typeof packedManifest.dependencies !== 'object' ||
    packedManifest.dependencies === null ||
    !('tsx' in packedManifest.dependencies) ||
    packedManifest.dependencies.tsx === undefined
  ) {
    throw new Error('Packed manifest must declare tsx to support tryscript.config.ts on Node 20');
  }

  // The tarball intentionally excludes dependencies. Link the reviewed workspace
  // install so this smoke test exercises package files and exports without re-resolving.
  await symlink(join(packageRoot, 'node_modules'), join(packedRoot, 'node_modules'), 'dir');
  const consumerRoot = join(tempRoot, 'consumer');
  const consumerModules = join(consumerRoot, 'node_modules');
  await mkdir(consumerModules, { recursive: true });
  await symlink(packedRoot, join(consumerModules, 'tryscript'), 'dir');
  await writeFile(
    join(consumerRoot, 'tryscript.config.ts'),
    `import { defineConfig } from 'tryscript';

const suffix: string = 'config';

export default defineConfig({
  env: { TRYSCRIPT_SMOKE_CONFIG: \`typed-\${suffix}\` },
});
`,
  );
  await writeFile(
    join(consumerRoot, 'config-smoke.tryscript.md'),
    `# Test: Load a typed project config

\`\`\`console
$ node -e "console.log(process.env.TRYSCRIPT_SMOKE_CONFIG)"
typed-config
? 0
\`\`\`
`,
  );

  run(
    process.execPath,
    [
      '-e',
      "const api = require('tryscript'); if (typeof api.parseTestFile !== 'function') process.exit(1);",
    ],
    consumerRoot,
  );
  run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "const api = await import('tryscript'); if (typeof api.parseTestFile !== 'function') process.exit(1);",
    ],
    consumerRoot,
  );

  const exerciseCliBundles = () => {
    for (const entryPoint of ['dist/bin.mjs', 'dist/bin.cjs']) {
      const stdout = run(
        process.execPath,
        [join(packedRoot, entryPoint), '--version'],
        consumerRoot,
      );
      if (!expectedVersionPattern.test(stdout.trim())) {
        throw new Error(`${entryPoint} returned an invalid version: ${stdout.trim()}`);
      }
      const readme = run(
        process.execPath,
        [join(packedRoot, entryPoint), 'readme', '--raw'],
        consumerRoot,
      );
      if (!readme.startsWith('# tryscript\n')) {
        throw new Error(`${entryPoint} could not read the packaged README`);
      }
      const docs = run(
        process.execPath,
        [join(packedRoot, entryPoint), 'docs', '--raw'],
        consumerRoot,
      );
      if (!docs.startsWith('# tryscript Reference\n')) {
        throw new Error(`${entryPoint} could not read the packaged reference`);
      }
      run(
        process.execPath,
        [join(packedRoot, entryPoint), 'run', 'config-smoke.tryscript.md'],
        consumerRoot,
      );
    }
  };

  // A .ts config must load whether the consumer treats extensionless JavaScript as
  // CommonJS or ESM. Each CLI run uses a new process, so module caches cannot mask it.
  exerciseCliBundles();
  await writeFile(join(consumerRoot, 'package.json'), '{"type":"module"}\n');
  exerciseCliBundles();
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
