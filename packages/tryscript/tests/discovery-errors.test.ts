/**
 * Discovery must fail when it cannot read a directory, as fast-glob did through v0.2.1,
 * rather than silently running fewer tests.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as NodeFs from 'node:fs';

/** Directory names whose readdir fails, keyed to the error code to report. */
const failures = new Map<string, string>();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  const readdir = ((path: string, options: unknown, callback: (...args: unknown[]) => void) => {
    // fdir passes directory paths with a trailing slash.
    const code = [...failures].find(([name]) => path.replace(/\/$/, '').endsWith(`/${name}`))?.[1];
    if (code) {
      const error = Object.assign(new Error(`${code}: ${path}`), { code, path });
      callback(error, []);
      return;
    }
    (actual.readdir as (...args: unknown[]) => void)(path, options, callback);
  }) as typeof actual.readdir;
  return { ...actual, readdir };
});

const { findTestFiles } = await import('../src/lib/discovery.js');

describe('findTestFiles read errors', () => {
  let root: string;

  beforeAll(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-errors-')));
    for (const dir of ['ok', 'locked', 'vanished']) {
      await mkdir(join(root, dir));
      await writeFile(join(root, dir, 'x.tryscript.md'), '');
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('fails naming the unreadable directory instead of dropping its tests', async () => {
    failures.set('locked', 'EACCES');
    try {
      await expect(findTestFiles(['**/*.tryscript.md'], root)).rejects.toThrow(
        `Test discovery could not read ${join(root, 'locked')}: EACCES. ` +
          'Fix its permissions or narrow the test patterns.',
      );
    } finally {
      failures.clear();
    }
  });

  it('ignores a directory removed during the crawl (ENOENT), as fast-glob did', async () => {
    failures.set('vanished', 'ENOENT');
    try {
      expect(await findTestFiles(['**/*.tryscript.md'], root)).toEqual([
        join(root, 'locked', 'x.tryscript.md').replace(/\\/g, '/'),
        join(root, 'ok', 'x.tryscript.md').replace(/\\/g, '/'),
      ]);
    } finally {
      failures.clear();
    }
  });
});
