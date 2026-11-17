/**
 * Test file discovery semantics that `tryscript run` relies on.
 *
 * Most cases pin the behavior shipped through v0.2.1 (fast-glob) and v0.3.1 (tinyglobby),
 * so a change of glob implementation cannot silently change which files a run selects. The
 * cases for patterns rooted above cwd cover where tinyglobby, used directly, drops files.
 * The second suite pins where v0.4.0's own matcher follows the documented rules instead.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findTestFiles } from '../src/lib/discovery.js';

/** Glob patterns always use forward slashes, including absolute patterns on Windows. */
function toPattern(path: string): string {
  return path.replace(/\\/g, '/');
}

describe('findTestFiles', () => {
  let root: string;

  /** Expected absolute result, in the slash form the glob implementation returns. */
  const abs = (rel: string): string => toPattern(join(root, rel));

  beforeAll(async () => {
    // realpath so macOS /var -> /private/var does not differ from returned paths.
    root = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-')));
    const files = [
      'a.tryscript.md',
      'b.tryscript.md',
      'notes.md',
      'tests/golden/cli-axes.tryscript.md',
      'tests/golden/cli-cache.tryscript.md',
      'tests/golden/cli-other.tryscript.md',
      'tests/golden/session.cast',
      'tests/unit/z.tryscript.md',
      '.hidden/h.tryscript.md',
      'tests/.dot.tryscript.md',
      'node_modules/pkg/n.tryscript.md',
      'dist/d.tryscript.md',
      'tests/dist/nested.tryscript.md',
      'sub/s.tryscript.md',
      'we[i]rd (dir)/w.tryscript.md',
    ];
    for (const file of files) {
      const path = join(root, file);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, '');
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds recursive matches relative to cwd, skipping dot paths, node_modules, and dist', async () => {
    expect(await findTestFiles(['**/*.tryscript.md'], root)).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('sub/s.tryscript.md'),
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
      abs('tests/golden/cli-other.tryscript.md'),
      abs('tests/unit/z.tryscript.md'),
      abs('we[i]rd (dir)/w.tryscript.md'),
    ]);
  });

  it('matches files inside cwd from a pattern rooted above it', async () => {
    const cwd = join(root, 'tests', 'golden');
    expect(await findTestFiles(['../../**/*.tryscript.md'], cwd)).toEqual(
      await findTestFiles(['**/*.tryscript.md'], root),
    );
    expect(await findTestFiles(['../../*/golden/cli-axes.tryscript.md'], cwd)).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
    ]);
    expect(await findTestFiles([`${toPattern(root)}/**/cli-axes.tryscript.md`], cwd)).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
    ]);
  });

  it('skips node_modules and dist below a pattern rooted above cwd', async () => {
    const found = await findTestFiles(['../**/*.tryscript.md'], join(root, 'sub'));
    expect(found).toContain(abs('sub/s.tryscript.md'));
    expect(found.filter((f) => /\/(node_modules|dist)\//.test(f))).toEqual([]);
  });

  it('resolves negations from cwd when another pattern climbs above it', async () => {
    expect(
      await findTestFiles(
        ['../*.tryscript.md', 'golden/*.tryscript.md', '!golden/cli-other.*'],
        join(root, 'tests'),
      ),
    ).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
    ]);
  });

  it('applies a negation starting with ** at any depth', async () => {
    expect(
      await findTestFiles(
        [`${toPattern(root)}/tests/golden/*.tryscript.md`, '!**/cli-other.*'],
        join(root, 'sub'),
      ),
    ).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
    ]);
  });

  it('searches a working directory that is itself inside dist', async () => {
    const cwd = join(root, 'dist');
    expect(await findTestFiles(['*.tryscript.md'], cwd)).toEqual([abs('dist/d.tryscript.md')]);
    expect(await findTestFiles([`${toPattern(cwd)}/*.tryscript.md`], cwd)).toEqual([
      abs('dist/d.tryscript.md'),
    ]);
  });

  it('keeps matches under a cwd inside dist when another pattern climbs above it', async () => {
    const cwd = join(root, 'dist');
    expect(await findTestFiles(['*.tryscript.md', '../sub/*.tryscript.md'], cwd)).toEqual([
      abs('dist/d.tryscript.md'),
      abs('sub/s.tryscript.md'),
    ]);
    expect(await findTestFiles(['*.tryscript.md', '!../sub/*.tryscript.md'], cwd)).toEqual([
      abs('dist/d.tryscript.md'),
    ]);
  });

  it('treats glob characters in the cwd path literally', async () => {
    expect(
      await findTestFiles(['../a.tryscript.md', '*.tryscript.md'], join(root, 'we[i]rd (dir)')),
    ).toEqual([abs('a.tryscript.md'), abs('we[i]rd (dir)/w.tryscript.md')]);
  });

  it('searches from a cwd inside a dot directory', async () => {
    expect(await findTestFiles(['*.tryscript.md'], join(root, '.hidden'))).toEqual([
      abs('.hidden/h.tryscript.md'),
    ]);
  });

  it('accepts an absolute forward-slash pattern', async () => {
    const pattern = `${toPattern(root)}/tests/golden/*.tryscript.md`;
    expect(await findTestFiles([pattern], join(root, 'sub'))).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
      abs('tests/golden/cli-other.tryscript.md'),
    ]);
  });

  it('expands brace alternatives', async () => {
    expect(await findTestFiles(['tests/golden/{cli-axes,cli-cache}.tryscript.md'], root)).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
    ]);
  });

  it('matches a literal file path', async () => {
    expect(await findTestFiles(['tests/unit/z.tryscript.md'], root)).toEqual([
      abs('tests/unit/z.tryscript.md'),
    ]);
  });

  it('matches nothing for a bare directory pattern', async () => {
    expect(await findTestFiles(['tests'], root)).toEqual([]);
    expect(await findTestFiles(['tests/golden'], root)).toEqual([]);
  });

  it('matches dot paths only when the pattern names them', async () => {
    expect(await findTestFiles(['.hidden/*.tryscript.md'], root)).toEqual([
      abs('.hidden/h.tryscript.md'),
    ]);
    expect(await findTestFiles(['tests/.*.tryscript.md'], root)).toEqual([
      abs('tests/.dot.tryscript.md'),
    ]);
  });

  it('ignores node_modules and dist even when named explicitly', async () => {
    expect(await findTestFiles(['node_modules/**/*.tryscript.md'], root)).toEqual([]);
    expect(await findTestFiles(['dist/*.tryscript.md'], root)).toEqual([]);
  });

  it('applies negated patterns', async () => {
    expect(await findTestFiles(['tests/golden/*.tryscript.md', '!**/cli-other.*'], root)).toEqual([
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
    ]);
  });

  it('excludes a whole directory named by a negation', async () => {
    expect(await findTestFiles(['**/*.tryscript.md', '!tests'], root)).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('sub/s.tryscript.md'),
      abs('we[i]rd (dir)/w.tryscript.md'),
    ]);
  });

  it('excludes files but not deeper directories for a negation ending in a wildcard', async () => {
    expect(await findTestFiles(['**/*.tryscript.md', '!tests/*'], root)).toEqual(
      await findTestFiles(['**/*.tryscript.md'], root),
    );
  });

  it('excludes each directory a brace list in a negation names', async () => {
    expect(await findTestFiles(['**/*.tryscript.md', '!{tests,sub}'], root)).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('we[i]rd (dir)/w.tryscript.md'),
    ]);
    expect(await findTestFiles(['**/*.tryscript.md', '!tests/{golden,unit}'], root)).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('sub/s.tryscript.md'),
      abs('we[i]rd (dir)/w.tryscript.md'),
    ]);
  });

  it('resolves parent-relative patterns', async () => {
    expect(await findTestFiles(['../*.tryscript.md'], join(root, 'sub'))).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
    ]);
  });

  it('matches other extensions', async () => {
    expect(await findTestFiles(['**/*.cast'], root)).toEqual([abs('tests/golden/session.cast')]);
  });

  it('returns each file once, sorted, across overlapping patterns', async () => {
    expect(
      await findTestFiles(
        ['tests/golden/cli-c*.tryscript.md', 'tests/golden/*-axes.*', '*.tryscript.md'],
        root,
      ),
    ).toEqual([
      abs('a.tryscript.md'),
      abs('b.tryscript.md'),
      abs('tests/golden/cli-axes.tryscript.md'),
      abs('tests/golden/cli-cache.tryscript.md'),
    ]);
  });

  it('returns nothing when no file matches', async () => {
    expect(await findTestFiles([`${toPattern(root)}/nonexistent/*.tryscript.md`], root)).toEqual(
      [],
    );
  });

  it('matches nothing for an empty pattern or one that resolves to the filesystem root', async () => {
    expect(await findTestFiles(['', '!', '../'.repeat(64), '/'], root)).toEqual([]);
  });

  it('excludes files below a directory a negation names, even when the pattern starts inside it', async () => {
    expect(await findTestFiles(['tests/golden/*.tryscript.md', '!tests'], root)).toEqual([]);
    expect(await findTestFiles(['tests/golden/*.tryscript.md', '!**/golden'], root)).toEqual([]);
    expect(await findTestFiles(['tests/golden/*.tryscript.md', '!tests/**'], root)).toEqual([]);
  });
});

describe('findTestFiles syntax, exclusions, and links', () => {
  let root: string;

  const abs = (rel: string): string => toPattern(join(root, rel));

  beforeAll(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-syntax-')));
    const files = [
      'lit/foo[1].tryscript.md',
      'lit/foo1.tryscript.md',
      'lit/b{1,2}.tryscript.md',
      'lit/b1.tryscript.md',
      'paren/copy (1).tryscript.md',
      'paren/copy 1.tryscript.md',
      'cls/a1.tryscript.md',
      'cls/b2.tryscript.md',
      'cls/cc.tryscript.md',
      'flat/x.tryscript.md',
      'flat/tests/top.tryscript.md',
      'flat/tests/deep/inner.tryscript.md',
      'node_modules/lit[1].tryscript.md',
      '.hidden/h.tryscript.md',
      '.hidden/node_modules/z.tryscript.md',
      '.hidden/dist/d.tryscript.md',
      'target/t.tryscript.md',
      // More directories than discovery reads at once.
      ...Array.from({ length: 40 }, (_, i) => `many/d${String(i).padStart(2, '0')}/x.tryscript.md`),
    ];
    for (const file of files) {
      const path = join(root, file);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, '');
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('selects a file whose literal path contains glob characters, as picomatch did', async () => {
    expect(await findTestFiles(['lit/foo[1].tryscript.md'], root)).toEqual([
      abs('lit/foo1.tryscript.md'),
      abs('lit/foo[1].tryscript.md'),
    ]);
    expect(await findTestFiles(['lit/b{1,2}.tryscript.md'], root)).toEqual([
      abs('lit/b1.tryscript.md'),
      abs('lit/b{1,2}.tryscript.md'),
    ]);
  });

  it('applies exclusions and ignored directories to a literal-path match', async () => {
    expect(
      await findTestFiles(['lit/foo[1].tryscript.md', '!lit/foo[1].tryscript.md'], root),
    ).toEqual([]);
    expect(await findTestFiles(['lit/foo[1].tryscript.md', '!lit'], root)).toEqual([]);
    expect(await findTestFiles(['node_modules/lit[1].tryscript.md'], root)).toEqual([]);
  });

  it('treats parentheses as literal characters', async () => {
    expect(await findTestFiles(['paren/* (1).tryscript.md'], root)).toEqual([
      abs('paren/copy (1).tryscript.md'),
    ]);
  });

  it('matches ? and character classes, including POSIX class names', async () => {
    expect(await findTestFiles(['cls/?[[:digit:]].tryscript.md'], root)).toEqual([
      abs('cls/a1.tryscript.md'),
      abs('cls/b2.tryscript.md'),
    ]);
    expect(await findTestFiles(['cls/[!a]?.tryscript.md'], root)).toEqual([
      abs('cls/b2.tryscript.md'),
      abs('cls/cc.tryscript.md'),
    ]);
  });

  it.each([
    ['cls/+(a)1.tryscript.md', 'extended glob syntax "+("'],
    ['!cls/@(a|b)*', 'extended glob syntax "@("'],
    ['cls/(a|b)1.tryscript.md', 'the alternation group "(a|b)"'],
    ['cls/{1..3}.tryscript.md', 'the brace range "{1..3}"'],
  ])('rejects %s, naming the pattern and the syntax', async (pattern, syntax) => {
    await expect(findTestFiles(['**/*.tryscript.md', pattern], root)).rejects.toThrow(
      `Test pattern "${pattern}" uses ${syntax}, which tryscript does not support.`,
    );
  });

  it('rejects a pattern whose braces expand to too many alternatives', async () => {
    await expect(findTestFiles(['{a,b}'.repeat(11)], root)).rejects.toThrow('brace alternatives');
  });

  it('excludes only files for a ** negation ending in a wildcard, not deeper directories', async () => {
    expect(await findTestFiles(['flat/**/*.tryscript.md', '!**/tests/*'], root)).toEqual([
      abs('flat/tests/deep/inner.tryscript.md'),
      abs('flat/x.tryscript.md'),
    ]);
  });

  it('finds a dot directory that a pattern names after **', async () => {
    expect(await findTestFiles(['**/.hidden/*.tryscript.md'], root)).toEqual([
      abs('.hidden/h.tryscript.md'),
    ]);
  });

  it('keeps a dot directory a pattern names out of reach of ** negations', async () => {
    for (const negation of ['!**', '!./**', '!**/*']) {
      expect(await findTestFiles(['.hidden/*.tryscript.md', negation], root)).toEqual([
        abs('.hidden/h.tryscript.md'),
      ]);
    }
    expect(await findTestFiles(['.hidden/*.tryscript.md', '!.hidden'], root)).toEqual([]);
  });

  it('skips node_modules and dist inside a dot directory a pattern names', async () => {
    expect(await findTestFiles(['.hidden/**/*.tryscript.md'], root)).toEqual([
      abs('.hidden/h.tryscript.md'),
    ]);
  });

  it('expands brace alternatives that climb above cwd', async () => {
    expect(await findTestFiles(['{../lit/foo1,x}.tryscript.md'], join(root, 'flat'))).toEqual([
      abs('flat/x.tryscript.md'),
      abs('lit/foo1.tryscript.md'),
    ]);
  });

  it('finds files across more directories than it reads at once', async () => {
    const found = await findTestFiles(['many/*/x.tryscript.md'], root);
    expect(found).toHaveLength(40);
    expect(found[0]).toBe(abs('many/d00/x.tryscript.md'));
  });

  describe.skipIf(process.platform === 'win32')('symbolic links', () => {
    beforeAll(async () => {
      await mkdir(join(root, 'links'), { recursive: true });
      await symlink(join(root, 'target'), join(root, 'links', 'dir-a'), 'dir');
      await symlink(join(root, 'target'), join(root, 'links', 'dir-b'), 'dir');
      await symlink(
        join(root, 'target', 't.tryscript.md'),
        join(root, 'links', 'file.tryscript.md'),
        'file',
      );
      await symlink(join(root, 'missing.tryscript.md'), join(root, 'links', 'broken.tryscript.md'));
      await symlink(root, join(root, 'links', 'loop'), 'dir');
      await symlink(join(root, 'links'), join(root, 'target', 'back'), 'dir');
      await symlink(join(root, 'target'), join(root, 'links', 'node_modules'), 'dir');
      // project/alias leads outside; outside/child/up leads back to the directory holding it.
      await mkdir(join(root, 'project'), { recursive: true });
      await mkdir(join(root, 'outside', 'child'), { recursive: true });
      await writeFile(join(root, 'outside', 'unrelated.tryscript.md'), '');
      await writeFile(join(root, 'outside', 'child', 'c.tryscript.md'), '');
      await symlink(join(root, 'outside', 'child'), join(root, 'project', 'alias'), 'dir');
      await symlink(join(root, 'outside'), join(root, 'outside', 'child', 'up'), 'dir');
    });

    it('follows links, except one named node_modules, and reports matches at their link paths', async () => {
      expect(await findTestFiles(['links/**/*.tryscript.md'], root)).toEqual([
        abs('links/dir-a/t.tryscript.md'),
        abs('links/dir-b/t.tryscript.md'),
        abs('links/file.tryscript.md'),
      ]);
    });

    it('does not follow a link back to a directory above it', async () => {
      // links/loop points at root, and target/back/dir-a at target, which hold them. v0.3.1
      // followed such a link once, so every test below it ran a second time.
      expect(await findTestFiles(['**/t.tryscript.md'], root)).toEqual([
        abs('links/dir-a/t.tryscript.md'),
        abs('links/dir-b/t.tryscript.md'),
        abs('target/t.tryscript.md'),
      ]);
    });

    it('does not follow a link into a directory the search is already inside', async () => {
      expect(await findTestFiles(['project/**/*.tryscript.md'], root)).toEqual([
        abs('project/alias/c.tryscript.md'),
      ]);
    });

    it('stops, naming the directory, when links fan out to it along too many paths', async () => {
      // Twelve levels, each with two links to the next: 2,048 paths to the last level, though
      // no link loops. The run fails instead of multiplying its work.
      const fan = realpathSync(await mkdtemp(join(tmpdir(), 'tryscript-discovery-fan-')));
      try {
        for (let level = 0; level < 12; level++) {
          await mkdir(join(fan, `l${level}`));
        }
        await writeFile(join(fan, 'l11', 'x.tryscript.md'), '');
        for (let level = 0; level < 11; level++) {
          for (const name of ['a', 'b']) {
            await symlink(join(fan, `l${level + 1}`), join(fan, `l${level}`, name), 'dir');
          }
        }
        await expect(findTestFiles(['l0/**/*.tryscript.md'], fan)).rejects.toThrow(
          /^Test discovery reached .*\/l\d+ through more than 64 symbolic-link paths\./,
        );
        // Below the budget, every path is still reported.
        expect(await findTestFiles(['l5/**/*.tryscript.md'], fan)).toHaveLength(64);
      } finally {
        await rm(fan, { recursive: true, force: true });
      }
    });
  });
});
