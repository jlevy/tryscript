/**
 * `requires:` resolution (gh#54): commands must resolve on the composed PATH before any
 * session runs, and the run reports where each landed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from '../src/lib/config.js';
import { validateConfig } from '../src/lib/parser.js';
import {
  isBareCommandName,
  preflightRequires,
  requiresProblem,
  resolveCommand,
} from '../src/lib/requires.js';

const posixOnly = process.platform === 'win32' ? it.skip : it;
/** POSIX lookup semantics, so these cases mean the same thing on every host. */
const posix = { platform: 'linux' as const };

function writeExecutable(path: string, body = '#!/bin/sh\necho tool\n'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

describe('resolveCommand', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tryscript-requires-'));
    writeExecutable(join(root, 'first', 'tool'));
    writeExecutable(join(root, 'second', 'tool'));
    writeFileSync(join(root, 'second', 'plain'), 'not executable\n');
    mkdirSync(join(root, 'second', 'dir-named-tool', 'tool'), { recursive: true });
    mkdirSync(join(root, 'win'));
    writeFileSync(join(root, 'win', 'tool.CMD'), '@echo tool\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the first PATH entry holding the command', () => {
    const entries = [join(root, 'missing'), join(root, 'first'), join(root, 'second')];
    expect(resolveCommand('tool', entries, posix)).toBe(join(root, 'first', 'tool'));
  });

  it('skips empty entries instead of reading them as the working directory', () => {
    expect(resolveCommand('tool', ['', join(root, 'second')], posix)).toBe(
      join(root, 'second', 'tool'),
    );
  });

  posixOnly('treats a symlink loop as no command rather than an error', () => {
    const dir = join(root, 'loop');
    mkdirSync(dir);
    symlinkSync(join(dir, 'tool'), join(dir, 'tool'));
    expect(resolveCommand('tool', [dir], posix)).toBeUndefined();
  });

  posixOnly('skips files without the execute bit and directories', () => {
    expect(resolveCommand('plain', [join(root, 'second')], posix)).toBeUndefined();
    expect(resolveCommand('tool', [join(root, 'second', 'dir-named-tool')], posix)).toBeUndefined();
  });

  it('tries PATHEXT extensions on Windows', () => {
    const options = { platform: 'win32' as const, pathext: '.EXE;.CMD' };
    expect(resolveCommand('tool', [join(root, 'win')], options)).toBe(
      join(root, 'win', 'tool.CMD'),
    );
    expect(resolveCommand('tool.CMD', [join(root, 'win')], options)).toBe(
      join(root, 'win', 'tool.CMD'),
    );
    expect(resolveCommand('tool', [join(root, 'win')], { ...options, pathext: '.EXE' })).toBe(
      undefined,
    );
  });
});

describe('requires validation', () => {
  it('accepts bare names only', () => {
    expect(isBareCommandName('fdu')).toBe(true);
    expect(isBareCommandName('')).toBe(false);
    expect(isBareCommandName('bin/fdu')).toBe(false);
    expect(isBareCommandName('bin\\fdu')).toBe(false);
  });

  it('describes malformed values', () => {
    expect(requiresProblem(undefined)).toBeUndefined();
    expect(requiresProblem(['fdu', 'git'])).toBeUndefined();
    expect(requiresProblem('fdu')).toBe('requires must be a list of command names');
    expect(requiresProblem(['fdu', 3])).toBe('requires must be a list of command names');
    expect(requiresProblem(['./fdu'])).toBe(
      "requires entry './fdu' must be a bare command name, not a path",
    );
  });

  it('warns about path entries during frontmatter validation', () => {
    expect(validateConfig({ requires: ['target/debug/fdu'] })).toEqual([
      { path: 'requires.0', message: 'requires entries must be bare command names, not paths' },
    ]);
    expect(validateConfig({ requires: ['fdu'] })).toEqual([]);
  });

  it('merges project and frontmatter lists without duplicates or spreading strings', () => {
    expect(mergeConfig({ requires: ['git', 'fdu'] }, { requires: ['fdu', 'jq'] }).requires).toEqual(
      ['git', 'fdu', 'jq'],
    );
    expect(
      mergeConfig({ requires: ['git'] }, { requires: 'fdu' as unknown as string[] }).requires,
    ).toEqual(['git']);
  });
});

describe('preflightRequires', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tryscript-preflight-'));
    writeExecutable(join(root, 'a', 'tool'));
    writeExecutable(join(root, 'b', 'tool'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('groups resolutions by command and location, and lists searched directories on failure', () => {
    const a = join(root, 'a');
    const b = join(root, 'b');
    const { resolutions, failures } = preflightRequires(
      [
        { filePath: 'one.md', requires: ['tool'], pathEntries: [a], sessions: 3 },
        { filePath: 'two.md', requires: ['tool'], pathEntries: [a, b], sessions: 4 },
        { filePath: 'three.md', requires: ['tool', 'absent'], pathEntries: [b, ''], sessions: 1 },
      ],
      posix,
    );
    expect(resolutions).toEqual([
      { command: 'tool', path: join(a, 'tool'), files: 2, sessions: 7 },
      { command: 'tool', path: join(b, 'tool'), files: 1, sessions: 1 },
    ]);
    expect(failures).toEqual([{ filePath: 'three.md', command: 'absent', searched: [b] }]);
  });
});

describe('tryscript run with requires:', () => {
  const binPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.mjs');
  let root: string;

  beforeAll(() => {
    if (!existsSync(binPath)) {
      throw new Error(`CLI not built. Run 'pnpm build' first. Expected: ${binPath}`);
    }
    root = mkdtempSync(join(tmpdir(), 'tryscript-requires-cli-'));
    writeExecutable(join(root, 'bin', 'greet'), '#!/bin/sh\necho "hello from greet"\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const run = (args: string[], env: Record<string, string> = {}) => {
    const result = spawnSync(process.execPath, [binPath, 'run', ...args], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', ...env },
    });
    return { stderr: result.stderr, exitCode: result.status };
  };

  posixOnly('reports where each required command resolved, then runs', () => {
    writeFileSync(
      join(root, 'found.tryscript.md'),
      `---
path:
  - bin
requires:
  - greet
---

\`\`\`console
$ greet
hello from greet
? 0
\`\`\`

\`\`\`console
$ greet
hello from greet
? 0
\`\`\`
`,
    );
    const result = run(['found.tryscript.md']);
    expect(result.stderr).toContain(
      `resolved greet -> ${join(root, 'bin', 'greet')} (1 file, 2 sessions)`,
    );
    expect(result.exitCode).toBe(0);

    expect(run(['found.tryscript.md', '--quiet']).stderr).not.toContain('resolved greet');
  });

  posixOnly('aborts before any session when a required command is missing', () => {
    const marker = join(root, 'ran');
    writeFileSync(
      join(root, 'first.tryscript.md'),
      `\`\`\`console
$ touch ${marker}
? 0
\`\`\`
`,
    );
    writeFileSync(
      join(root, 'missing.tryscript.md'),
      `---
path:
  - $TRYSCRIPT_TEST_UNSET_DIR
  - bin
requires:
  - greet
  - not-a-real-tool
---

\`\`\`console
$ greet
hello from greet
? 0
\`\`\`
`,
    );
    const result = run(['first.tryscript.md', 'missing.tryscript.md'], { PATH: '/usr/bin:/bin' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `Error: required command 'not-a-real-tool' not found for ${join(root, 'missing.tryscript.md')}`,
    );
    expect(result.stderr).toContain(
      ['  searched:', `    ${join(root, 'bin')}`, '    /usr/bin', '    /bin'].join('\n'),
    );
    expect(existsSync(marker)).toBe(false);
  });

  it('rejects a path in requires', () => {
    writeFileSync(
      join(root, 'pathlike.tryscript.md'),
      `---
requires:
  - bin/greet
---

\`\`\`console
$ echo hi
hi
? 0
\`\`\`
`,
    );
    const result = run(['pathlike.tryscript.md']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "requires entry 'bin/greet' must be a bare command name, not a path",
    );
  });
});
