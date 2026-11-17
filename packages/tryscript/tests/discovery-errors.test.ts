/**
 * Discovery must fail when it cannot read a directory, as fast-glob did through v0.2.1,
 * rather than silently running fewer tests.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as NodeFs from 'node:fs';

/** Directory names whose readdir fails, keyed to the error code to report. */
const failures = new Map<string, string>();

/** Link names whose realpath fails, keyed to the error code to report. */
const linkFailures = new Map<string, string>();

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  const readdir = ((path: string, options: unknown, callback: (...args: unknown[]) => void) => {
    // Discovery passes directory paths with a trailing slash.
    const code = [...failures].find(([name]) => path.replace(/\/$/, '').endsWith(`/${name}`))?.[1];
    if (code) {
      const error = Object.assign(new Error(`${code}: ${path}`), { code, path });
      callback(error, []);
      return;
    }
    (actual.readdir as (...args: unknown[]) => void)(path, options, callback);
  }) as typeof actual.readdir;
  const realpath = ((path: string, callback: (...args: unknown[]) => void) => {
    const code = [...linkFailures].find(([name]) => path.endsWith(`/${name}`))?.[1];
    if (code) {
      callback(Object.assign(new Error(`${code}: ${path}`), { code, path }), '');
      return;
    }
    (actual.realpath as (...args: unknown[]) => void)(path, callback);
  }) as typeof actual.realpath;
  return { ...actual, readdir, realpath };
});

const { findTestFiles } = await import('../src/lib/discovery.js');

describe('findTestFiles read errors', () => {
  let root: string;

  beforeAll(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-errors-')));
    for (const dir of ['ok', 'locked', 'vanished', 'gate/proj', 'shared']) {
      await mkdir(join(root, dir), { recursive: true });
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

  it("never lists directories between cwd and another pattern's base", async () => {
    // A traversable but unlistable parent (mode 0711) must not fail the run.
    failures.set('gate', 'EACCES');
    try {
      expect(
        await findTestFiles(
          ['*.tryscript.md', `${root.replace(/\\/g, '/')}/shared/*.tryscript.md`],
          join(root, 'gate', 'proj'),
        ),
      ).toEqual([
        join(root, 'gate', 'proj', 'x.tryscript.md').replace(/\\/g, '/'),
        join(root, 'shared', 'x.tryscript.md').replace(/\\/g, '/'),
      ]);
    } finally {
      failures.clear();
    }
  });

  it('never reads a directory a negation excludes', async () => {
    failures.set('locked', 'EACCES');
    try {
      expect(await findTestFiles(['**/*.tryscript.md', '!locked/**'], root)).toEqual(
        ['gate/proj', 'ok', 'shared', 'vanished'].map((dir) =>
          join(root, dir, 'x.tryscript.md').replace(/\\/g, '/'),
        ),
      );
    } finally {
      failures.clear();
    }
  });

  it('never reads a directory below which no pattern can match', async () => {
    failures.set('locked', 'EACCES');
    try {
      // `locked` is never read: neither `[!lg]*` nor `{ok,shared}` matches its name.
      expect(
        await findTestFiles(['{ok,shared}/*.tryscript.md', '[!lg]*/x.tryscript.md'], root),
      ).toEqual(
        ['ok', 'shared', 'vanished'].map((dir) =>
          join(root, dir, 'x.tryscript.md').replace(/\\/g, '/'),
        ),
      );
    } finally {
      failures.clear();
    }
  });

  it('reports every unreadable directory, naming the first in path order', async () => {
    failures.set('vanished', 'EACCES');
    failures.set('locked', 'EPERM');
    try {
      await expect(findTestFiles(['**/*.tryscript.md'], root)).rejects.toThrow(
        `Test discovery could not read ${join(root, 'locked')}: EPERM (and 1 more).`,
      );
    } finally {
      failures.clear();
    }
  });

  it('ignores a directory removed during the crawl (ENOENT), as fast-glob did', async () => {
    failures.set('vanished', 'ENOENT');
    try {
      expect(await findTestFiles(['**/*.tryscript.md'], root)).toEqual(
        ['gate/proj', 'locked', 'ok', 'shared'].map((dir) =>
          join(root, dir, 'x.tryscript.md').replace(/\\/g, '/'),
        ),
      );
    } finally {
      failures.clear();
    }
  });

  describe.skipIf(process.platform === 'win32')('through symbolic links', () => {
    let linked: string;

    beforeAll(async () => {
      linked = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-link-errors-')));
      await mkdir(join(linked, 'target'));
      await writeFile(join(linked, 'target', 'x.tryscript.md'), '');
      await mkdir(join(linked, 'links'));
      await symlink(join(linked, 'target'), join(linked, 'links', 'guarded'), 'dir');
      await symlink(join(linked, 'missing'), join(linked, 'links', 'dangling'), 'dir');
    });

    afterAll(async () => {
      await rm(linked, { recursive: true, force: true });
    });

    it('skips a broken link, as fdir did', async () => {
      expect(await findTestFiles(['links/**/*.tryscript.md'], linked)).toEqual([
        join(linked, 'links', 'guarded', 'x.tryscript.md'),
      ]);
    });

    it('fails naming a link it cannot resolve instead of dropping the tests behind it', async () => {
      linkFailures.set('guarded', 'EACCES');
      try {
        await expect(findTestFiles(['links/**/*.tryscript.md'], linked)).rejects.toThrow(
          `Test discovery could not read ${join(linked, 'links', 'guarded')}: EACCES.`,
        );
      } finally {
        linkFailures.clear();
      }
    });

    it('never resolves a link a negation excludes', async () => {
      linkFailures.set('guarded', 'EACCES');
      try {
        for (const negation of ['!links/guarded', '!links/guarded/**', '!**/guarded']) {
          expect(await findTestFiles(['links/**/*.tryscript.md', negation], linked)).toEqual([]);
        }
      } finally {
        linkFailures.clear();
      }
    });

    it('skips a link that loops on itself (ELOOP)', async () => {
      linkFailures.set('guarded', 'ELOOP');
      try {
        expect(await findTestFiles(['links/**/*.tryscript.md'], linked)).toEqual([]);
      } finally {
        linkFailures.clear();
      }
    });
  });
});
