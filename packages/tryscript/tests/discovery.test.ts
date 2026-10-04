/**
 * Test file discovery semantics that `tryscript run` relies on.
 *
 * Most cases pin the behavior shipped through v0.2.1 (fast-glob), so a change of glob
 * implementation cannot silently change which files a run selects. The cases for
 * patterns rooted above cwd cover where tinyglobby, used directly, drops files.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
});
