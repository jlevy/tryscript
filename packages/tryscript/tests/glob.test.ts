/**
 * The glob matcher that test discovery uses. Expected results for supported syntax are the
 * ones picomatch, used through v0.3.1, gave with `dot: false` and `posix: true`.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_BRACE_ALTERNATIVES,
  MAX_BRACE_DEPTH,
  MAX_PATTERN_LENGTH,
  PathMatcher,
  expandBraces,
  findUnsupportedSyntax,
  isStaticSegment,
  matchSegment,
  parseSegment,
} from '../src/lib/glob.js';

const segment = (pattern: string, name: string): boolean =>
  matchSegment(parseSegment(pattern), name);

const path = (pattern: string, target: string): boolean =>
  new PathMatcher([pattern.split('/')]).matches(target.split('/'));

describe('matchSegment', () => {
  it.each([
    ['*.md', 'a.md', true],
    ['*.md', 'a.txt', false],
    ['a*', 'a', true],
    ['*', 'a b', true],
    ['a*b*c', 'axxbyyc', true],
    ['a*b*c', 'axxbyy', false],
    ['?.md', 'a.md', true],
    ['?.md', 'ab.md', false],
    ['?', 'é', true],
    ['a?c', 'a😀c', true],
    ['***', 'abc', true],
    ['**.md', 'a.md', true],
  ])('matches wildcards: %s against %s is %s', (pattern, name, expected) => {
    expect(segment(pattern, name)).toBe(expected);
  });

  it.each([
    ['[ab].md', 'b.md', true],
    ['[ab].md', 'c.md', false],
    ['[a-c].md', 'b.md', true],
    ['[!a].md', 'b.md', true],
    ['[!a].md', 'a.md', false],
    ['[^a].md', 'a.md', false],
    ['[]a].md', '].md', true],
    ['[a-]x', '-x', true],
    ['[\\]]x', ']x', true],
    ['[z-a]', 'b', false],
    ['[[:digit:]].md', '5.md', true],
    ['[[:digit:]].md', 'a.md', false],
    ['[[:alpha:][:digit:]]x', '5x', true],
    ['[[:upper:]]', 'Q', true],
    ['[[:upper:]]', 'q', false],
    ['[[:constructor:]]', 'c', false],
    ['[a', '[a', true],
    ['a]', 'a]', true],
    ['[a-', '[a-', true],
    ['[\\', '[\\', true],
  ])('matches classes: %s against %s is %s', (pattern, name, expected) => {
    expect(segment(pattern, name)).toBe(expected);
  });

  it.each([
    ['a\\*b', 'a*b', true],
    ['a\\*b', 'axb', false],
    ['\\[a]', '[a]', true],
    ['\\[a]', 'a', false],
    ['x\\', 'x\\', true],
    ['(dir)', '(dir)', true],
    ['(dir)', 'dir', false],
    ['a|b', 'a|b', true],
    ['{a}', '{a}', true],
  ])('matches escapes and literal characters: %s against %s is %s', (pattern, name, expected) => {
    expect(segment(pattern, name)).toBe(expected);
  });

  it.each([
    ['*', '.x', false],
    ['?x', '.x', false],
    ['*.md', '.md', false],
    ['.*', '.x', true],
    ['\\.x', '.x', true],
    ['[.]x', '.x', true],
    ['[!a]x', '.x', true],
  ])('matches a leading dot only explicitly: %s against %s is %s', (pattern, name, expected) => {
    expect(segment(pattern, name)).toBe(expected);
  });

  it.each([
    ['alnum', 'z', '_'],
    ['alpha', 'Q', '1'],
    ['ascii', '~', 'é'],
    ['blank', '\t', 'x'],
    ['cntrl', '\u0001', 'a'],
    ['digit', '7', 'a'],
    ['graph', '!', ' '],
    ['lower', 'q', 'Q'],
    ['print', ' ', '\u0001'],
    ['punct', '-', 'a'],
    ['space', '\n', 'a'],
    ['upper', 'Q', 'q'],
    ['word', '_', '-'],
    ['xdigit', 'F', 'g'],
  ])('matches the POSIX class [:%s:]', (name, inside, outside) => {
    expect(segment(`[[:${name}:]]`, inside)).toBe(true);
    expect(segment(`[[:${name}:]]`, outside)).toBe(false);
  });
});

describe('PathMatcher', () => {
  it.each([
    ['a/**', 'a', true],
    ['a/**', 'a/b/c', true],
    ['a/**', 'a/.b', false],
    ['a/**/b', 'a/b', true],
    ['a/**/b', 'a/x/y/b', true],
    ['a/**/b', 'a/.x/b', false],
    ['**/b', '.a/b', false],
    ['**', '.a/b', false],
    ['*/b', '.a/b', false],
    ['a/**/*', 'a/b/.c', false],
    ['a/***/b', 'a/x/y/b', false],
    ['**/c.md', 'c.md', true],
    ['**/**/c.md', 'x/c.md', true],
    ['a/*/c', 'a/b/c', true],
    ['a/*/c', 'a/b/x/c', false],
  ])('matches globstars: %s against %s is %s', (pattern, target, expected) => {
    expect(path(pattern, target)).toBe(expected);
  });

  it('tracks partial matches so a crawl reads only directories that can match', () => {
    const matcher = new PathMatcher([['a', '*', 'c.md']]);
    const inA = matcher.step(matcher.initial(), 'a');
    expect(matcher.canDescend(inA)).toBe(true);
    expect(matcher.accepts(inA)).toBe(false);
    expect(matcher.step(matcher.initial(), 'b')).toEqual([]);
    const file = matcher.step(matcher.step(inA, 'x'), 'c.md');
    expect(matcher.accepts(file)).toBe(true);
    expect(matcher.canDescend(file)).toBe(false);
  });

  it('matches any of several alternatives', () => {
    const matcher = new PathMatcher([
      ['a', '*.md'],
      ['**', 'b.txt'],
    ]);
    expect(matcher.matches(['a', 'x.md'])).toBe(true);
    expect(matcher.matches(['q', 'r', 'b.txt'])).toBe(true);
    expect(matcher.matches(['q', 'x.md'])).toBe(false);
  });
});

describe('isStaticSegment', () => {
  it.each([
    ['tests', true],
    ['we (dir)', true],
    ['{a}', true],
    ['*.md', false],
    ['a?', false],
    ['[ab]', false],
    ['a\\*', false],
    ['**', false],
  ])('treats %s as static: %s', (text, expected) => {
    expect(isStaticSegment(text)).toBe(expected);
  });
});

describe('expandBraces', () => {
  it.each([
    ['a/{b,c}/d', ['a/b/d', 'a/c/d']],
    ['{a,b/c}.md', ['a.md', 'b/c.md']],
    ['x{a,b}{c,d}', ['xac', 'xad', 'xbc', 'xbd']],
    ['{a,{b,c}}.md', ['a.md', 'b.md', 'c.md']],
    ['{a,}.md', ['a.md', '.md']],
    ['{a}.md', ['{a}.md']],
    ['{}.md', ['{}.md']],
    ['{a,b', ['{a,b']],
    ['{x{a,b}}', ['{xa}', '{xb}']],
    ['\\{a,b}', ['\\{a,b}']],
    ['{a\\,b,c}', ['a\\,b', 'c']],
    ['[{,]x', ['[{,]x']],
    ['{a,a}', ['a']],
    ['*.md', ['*.md']],
    ['{[a,b}', ['[a', 'b']],
    ['{[\\/],a}', ['[\\/]', 'a']],
    ['{[a-\\/],b}', ['[a-\\/]', 'b']],
  ])('expands %s', (pattern, expected) => {
    expect(expandBraces(pattern)).toEqual(expected);
  });

  it('refuses before expanding when the alternatives would exceed the cap', () => {
    const pattern = '{a,b}'.repeat(11);
    expect(2 ** 11).toBeGreaterThan(MAX_BRACE_ALTERNATIVES);
    expect(() => expandBraces(pattern)).toThrow(
      `expands to more than ${MAX_BRACE_ALTERNATIVES} brace alternatives`,
    );
    // Counting saturates, so even an astronomically large product is refused at once.
    const start = performance.now();
    expect(() => expandBraces('{a,b,c,d,e,f,g,h}'.repeat(200))).toThrow('brace alternatives');
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('expands up to the cap', () => {
    expect(expandBraces('{a,b}'.repeat(10))).toHaveLength(MAX_BRACE_ALTERNATIVES);
  });
});

describe('findUnsupportedSyntax', () => {
  it.each(['+(a)', '@(a|b).md', '*(x)', '?(x)', 'a/!(b)/c', 'x/**(a)'])(
    'rejects the extended glob %s',
    (pattern) => {
      expect(findUnsupportedSyntax(pattern)?.syntax).toMatch(/^extended glob syntax/);
    },
  );

  it.each(['(a|b).md', 'x/(unit|golden)/*.md', 'a/((b|c))', '[a/(b|c)]'])(
    'rejects the alternation group %s',
    (pattern) => {
      expect(findUnsupportedSyntax(pattern)?.syntax).toMatch(/^the alternation group/);
    },
  );

  it.each(['{1..3}.md', 'x/{a..e}', '{01..10}', '{1..9..2}'])(
    'rejects the brace range %s',
    (pattern) => {
      expect(findUnsupportedSyntax(pattern)?.syntax).toMatch(/^the brace range/);
    },
  );

  it.each([
    '**/*.tryscript.md',
    'copy (1).md',
    '(dir)/*.md',
    'a+b.md',
    '\\+(a)',
    '+\\(a)',
    '[+(]a)',
    '\\(a|b)',
    '{1,2}..{3,4}',
    '{a..b,c}',
    '{foo..bar}',
    'a|b',
    '(a\\|b)',
    '([|]a)',
    '(a|b',
  ])('accepts %s', (pattern) => {
    expect(findUnsupportedSyntax(pattern)).toBeUndefined();
  });
});

describe('matching time stays bounded on adversarial patterns', () => {
  // Each case would take exponential time in a backtracking matcher; the bound is generous
  // so the test proves the complexity class without timing noise.
  const BOUND_MS = 2000;

  it('matches many stars against a long non-matching name', () => {
    const start = performance.now();
    expect(segment(`${'*a'.repeat(40)}b`, 'a'.repeat(5000))).toBe(false);
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });

  it('matches many globstars against a deep non-matching path', () => {
    const start = performance.now();
    const pattern = [...Array.from({ length: 40 }, () => ['**', 'a']).flat(), 'b'];
    const target = Array.from({ length: 400 }, () => 'a');
    expect(new PathMatcher([pattern]).matches(target)).toBe(false);
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });

  it('rejects the repeated single-branch extglobs of GHSA-fc5q-39xc-vjpf immediately', () => {
    const start = performance.now();
    expect(findUnsupportedSyntax(`${'+(a)'.repeat(1000)}b`)).toBeDefined();
    expect(findUnsupportedSyntax(`${'*(+(a))'.repeat(500)}b`)).toBeDefined();
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });

  it('matches escaped extglob characters literally and quickly', () => {
    const start = performance.now();
    const pattern = `${'+\\(a)'.repeat(50)}b`;
    expect(findUnsupportedSyntax(pattern)).toBeUndefined();
    expect(segment(pattern, `${'+(a)'.repeat(50)}b`)).toBe(true);
    expect(segment(pattern, 'a'.repeat(5000))).toBe(false);
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });

  it('refuses a pattern longer than the length limit before parsing it', () => {
    const start = performance.now();
    const deep = `${'{a,'.repeat(2000)}b${'}'.repeat(2000)}`;
    expect(deep.length).toBeGreaterThan(MAX_PATTERN_LENGTH);
    expect(() => expandBraces(deep)).toThrow(`longer than ${MAX_PATTERN_LENGTH} characters`);
    expect(() => findUnsupportedSyntax(deep)).toThrow('longer than');
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });

  it('refuses braces nested deeper than the depth limit', () => {
    const nest = (depth: number): string =>
      `${Array.from({ length: depth }, (_, i) => `{a${i},`).join('')}b${'}'.repeat(depth)}`;
    expect(expandBraces(nest(MAX_BRACE_DEPTH))).toHaveLength(MAX_BRACE_DEPTH + 1);
    expect(() => expandBraces(nest(MAX_BRACE_DEPTH + 1))).toThrow(
      `nests braces more than ${MAX_BRACE_DEPTH} deep`,
    );
  });

  it.each([
    ['unclosed classes', '['],
    ['unclosed braces', '{'],
    ['unclosed parentheses', '('],
    ['braces around unclosed classes', '{['],
    ['parentheses around unclosed classes', '(['],
    ['escapes', '\\'],
  ])('parses a maximum-length pattern of %s quickly', (_label, unit) => {
    const pattern = unit.repeat(Math.floor(MAX_PATTERN_LENGTH / unit.length));
    const start = performance.now();
    findUnsupportedSyntax(pattern);
    expandBraces(pattern);
    parseSegment(pattern);
    expect(performance.now() - start).toBeLessThan(BOUND_MS);
  });
});
