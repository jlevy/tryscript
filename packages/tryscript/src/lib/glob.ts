/**
 * Glob matching for test discovery.
 *
 * Patterns are matched one path segment at a time, and no regular expression is ever built
 * from a pattern, so matching time is bounded by the product of pattern and path lengths.
 *
 * Supported syntax:
 *
 * - Within a segment: `*` (any run of characters), `?` (one character), `[...]` classes
 *   (`!` or `^` negation, `a-z` ranges, POSIX names such as `[:digit:]`), and `\` escapes.
 * - A segment that is exactly `**` matches zero or more directories.
 * - Brace alternatives (`{a,b}`, nested, spanning `/`), expanded before matching.
 *
 * A wildcard, a `?`, or `**` never matches a name that starts with `.`; a literal `.` (or a
 * class containing one) does. Every other character, parentheses and `|` included, matches
 * itself. Extended globs such as `+(a)`, alternation groups such as `(a|b)`, and brace ranges
 * such as `{1..3}`, which picomatch interpreted, are rejected rather than silently matched
 * literally.
 */

/** Most alternatives one pattern's braces may expand to. */
export const MAX_BRACE_ALTERNATIVES = 1024;

/**
 * Longest pattern accepted, longer than any path a test pattern names. Parsing scans are at
 * worst quadratic in pattern length, so this bounds them.
 */
export const MAX_PATTERN_LENGTH = 4096;

/** Deepest brace nesting accepted, so parsing recursion stays shallow. */
export const MAX_BRACE_DEPTH = 32;

/**
 * Longest `[...]` class accepted, in characters including its brackets, so each `[` costs a
 * bounded scan rather than one to the end of the pattern. A longer class is rejected rather
 * than silently read as literal text.
 */
export const MAX_CLASS_LENGTH = 256;

/** Reject a pattern too long to parse within the bounds above. */
export function assertPatternLength(pattern: string): void {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(
      `Test pattern "${pattern.slice(0, 60)}..." is longer than ${MAX_PATTERN_LENGTH} ` +
        'characters. Split it into simpler patterns.',
    );
  }
}

/** POSIX class names, as picomatch defined them, keyed in a Map so no inherited name applies. */
const POSIX_CLASSES = new Map<string, (cp: number) => boolean>([
  ['alnum', (cp) => isAlpha(cp) || isDigit(cp)],
  ['alpha', (cp) => isAlpha(cp)],
  ['ascii', (cp) => cp <= 0x7f],
  ['blank', (cp) => cp === 0x20 || cp === 0x09],
  ['cntrl', (cp) => cp <= 0x1f || cp === 0x7f],
  ['digit', (cp) => isDigit(cp)],
  ['graph', (cp) => cp >= 0x21 && cp <= 0x7e],
  ['lower', (cp) => cp >= 0x61 && cp <= 0x7a],
  ['print', (cp) => cp >= 0x20 && cp <= 0x7e],
  ['punct', (cp) => cp >= 0x21 && cp <= 0x7e && !isAlpha(cp) && !isDigit(cp)],
  ['space', (cp) => cp === 0x20 || (cp >= 0x09 && cp <= 0x0d)],
  ['upper', (cp) => cp >= 0x41 && cp <= 0x5a],
  ['word', (cp) => isAlpha(cp) || isDigit(cp) || cp === 0x5f],
  ['xdigit', (cp) => isDigit(cp) || (cp >= 0x41 && cp <= 0x46) || (cp >= 0x61 && cp <= 0x66)],
]);

function isAlpha(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
}

function isDigit(cp: number): boolean {
  return cp >= 0x30 && cp <= 0x39;
}

/** A bash-style brace range body: `1..3`, `a..e`, or `1..9..2`. */
const BRACE_RANGE = /^(?:-?\d+|[A-Za-z])\.\.(?:-?\d+|[A-Za-z])(?:\.\.-?\d+)?$/;

/** One character of a segment pattern. */
type Token =
  | { kind: 'char'; value: number }
  | { kind: 'any' }
  | { kind: 'star' }
  | { kind: 'class'; matches: (cp: number) => boolean };

/** A compiled path segment: either `**` or a sequence of single-character tokens. */
export interface Segment {
  globstar: boolean;
  tokens: Token[];
  /** The one name a segment without wildcards or classes matches. */
  literal: string | undefined;
}

/** A character class starting at `start` (the `[`), with the index of its closing `]`. */
interface ParsedClass {
  end: number;
  matches: (cp: number) => boolean;
}

/**
 * Parse a `[...]` class starting at `start`, or return undefined when the `[` opens no class
 * (no closing `]` before the end of the segment), in which case it is a literal `[`.
 */
function parseClass(text: string, start: number): ParsedClass | undefined {
  let i = start + 1;
  let negated = false;
  if (text[i] === '!' || text[i] === '^') {
    negated = true;
    i++;
  }
  const ranges: [number, number][] = [];
  const named: ((cp: number) => boolean)[] = [];
  let first = true;
  const limit = Math.min(text.length, start + MAX_CLASS_LENGTH);
  while (i < limit && text[i] !== '/') {
    if (text[i] === ']' && !first) {
      const matches = (cp: number): boolean => {
        const inside = ranges.some(([lo, hi]) => cp >= lo && cp <= hi) || named.some((f) => f(cp));
        return inside !== negated;
      };
      return { end: i, matches };
    }
    first = false;
    if (text[i] === '[' && text[i + 1] === ':') {
      // Only the known names are tried, so this never scans past the class.
      const name = [...POSIX_CLASSES.keys()].find((n) => text.startsWith(`${n}:]`, i + 2));
      const test = name === undefined ? undefined : POSIX_CLASSES.get(name);
      if (name !== undefined && test) {
        named.push(test);
        i += name.length + 4;
        continue;
      }
    }
    const [lo, next] = readClassChar(text, i);
    if (lo === undefined) {
      return undefined;
    }
    if (text[next] === '-' && next + 1 < text.length && text[next + 1] !== ']') {
      const [hi, after] = readClassChar(text, next + 1);
      if (hi === undefined) {
        return undefined;
      }
      // A reversed range such as z-a matches nothing, as it did with picomatch.
      ranges.push([lo, hi]);
      i = after;
      continue;
    }
    ranges.push([lo, lo]);
    i = next;
  }
  if (i >= limit) {
    // The scan stopped at the length limit, not at the end of the segment. A `]` further on
    // means a longer class was intended.
    const close = text.indexOf(']', i);
    const slash = text.indexOf('/', i);
    if (close !== -1 && (slash === -1 || close < slash)) {
      throw new Error(
        `Test pattern "${text}" uses a character class longer than ${MAX_CLASS_LENGTH} ` +
          'characters. Shorten it, or escape the [ as \\[ to match it literally.',
      );
    }
  }
  return undefined;
}

/** Read one possibly escaped class member; a `/` ends the segment, so it ends the class. */
function readClassChar(text: string, i: number): [number | undefined, number] {
  let at = i;
  if (text[at] === '\\' && at + 1 < text.length) {
    at++;
  }
  const cp = text.codePointAt(at);
  if (cp === undefined || text[at] === '/') {
    return [undefined, at];
  }
  return [cp, at + (cp > 0xffff ? 2 : 1)];
}

/** Compile one path segment of a pattern. */
export function parseSegment(text: string): Segment {
  if (text === '**') {
    return { globstar: true, tokens: [], literal: undefined };
  }
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) {
      const cp = text.codePointAt(i + 1) ?? 0;
      tokens.push({ kind: 'char', value: cp });
      i += 1 + (cp > 0xffff ? 2 : 1);
      continue;
    }
    if (c === '*') {
      // Consecutive stars inside a segment act as one; only a whole `**` segment is a globstar.
      if (tokens.at(-1)?.kind !== 'star') {
        tokens.push({ kind: 'star' });
      }
      i++;
      continue;
    }
    if (c === '?') {
      tokens.push({ kind: 'any' });
      i++;
      continue;
    }
    if (c === '[') {
      const parsed = parseClass(text, i);
      if (parsed) {
        tokens.push({ kind: 'class', matches: parsed.matches });
        i = parsed.end + 1;
        continue;
      }
    }
    const cp = text.codePointAt(i) ?? 0;
    tokens.push({ kind: 'char', value: cp });
    i += cp > 0xffff ? 2 : 1;
  }
  const literal = tokens.every((t) => t.kind === 'char')
    ? String.fromCodePoint(...tokens.map((t) => t.value))
    : undefined;
  return { globstar: false, tokens, literal };
}

/** Whether a segment has no glob syntax, so it names exactly one directory or file. */
export function isStaticSegment(text: string): boolean {
  return !/[*?[\\]/.test(text);
}

function tokenMatches(token: Token, cp: number): boolean {
  switch (token.kind) {
    case 'char':
      return token.value === cp;
    case 'any':
      return true;
    case 'class':
      return token.matches(cp);
    case 'star':
      return false;
  }
}

/**
 * Match one name against a non-globstar segment. Stars backtrack only to the most recent
 * star, so matching takes at most (name length) x (segment length) steps.
 */
export function matchSegment(segment: Segment, name: string): boolean {
  const { tokens, literal } = segment;
  if (literal !== undefined) {
    return name === literal;
  }
  if (name.startsWith('.')) {
    const first = tokens[0];
    if (first === undefined || first.kind === 'star' || first.kind === 'any') {
      return false;
    }
  }
  // Positions are UTF-16 indices that always advance by whole code points.
  const width = (at: number): number => ((name.codePointAt(at) ?? 0) > 0xffff ? 2 : 1);
  let ti = 0;
  let ci = 0;
  let starToken = -1;
  let starChar = 0;
  while (ci < name.length) {
    const token = tokens[ti];
    if (token?.kind === 'star') {
      starToken = ti;
      starChar = ci;
      ti++;
    } else if (token !== undefined && tokenMatches(token, name.codePointAt(ci) ?? 0)) {
      ti++;
      ci += width(ci);
    } else if (starToken !== -1) {
      ti = starToken + 1;
      starChar += width(starChar);
      ci = starChar;
    } else {
      return false;
    }
  }
  while (tokens[ti]?.kind === 'star') {
    ti++;
  }
  return ti === tokens.length;
}

/**
 * Matches paths, given as lists of names, against a set of alternative segment patterns.
 * It runs as a nondeterministic automaton whose states are positions in the alternatives,
 * so each name is consumed once against at most every position.
 */
export class PathMatcher {
  /** Each alternative's segments, followed by an `undefined` accepting position. */
  private readonly positions: (Segment | undefined)[] = [];
  private readonly starts: number[] = [];

  constructor(alternatives: readonly (readonly string[])[]) {
    for (const segments of alternatives) {
      this.starts.push(this.positions.length);
      for (const text of segments) {
        this.positions.push(parseSegment(text));
      }
      this.positions.push(undefined);
    }
  }

  /** States before any name is consumed. */
  initial(): number[] {
    return this.closure(new Set(this.starts));
  }

  /** States after consuming one more name. */
  step(states: readonly number[], name: string): number[] {
    const next = new Set<number>();
    const dot = name.startsWith('.');
    for (const p of states) {
      const segment = this.positions[p];
      if (segment === undefined) {
        continue;
      }
      if (segment.globstar) {
        if (!dot) {
          next.add(p);
        }
      } else if (matchSegment(segment, name)) {
        next.add(p + 1);
      }
    }
    return this.closure(next);
  }

  /** Whether the names consumed so far form a complete match. */
  accepts(states: readonly number[]): boolean {
    return states.some((p) => this.positions[p] === undefined);
  }

  /** Whether some longer path could still match, so a directory is worth reading. */
  canDescend(states: readonly number[]): boolean {
    return states.some((p) => this.positions[p] !== undefined);
  }

  /** Whether a whole path matches. */
  matches(names: readonly string[]): boolean {
    let states = this.initial();
    for (const name of names) {
      if (states.length === 0) {
        return false;
      }
      states = this.step(states, name);
    }
    return this.accepts(states);
  }

  /** A `**` may match no directory, so a state on one also stands after it. */
  private closure(states: Set<number>): number[] {
    const pending = [...states];
    for (let p = pending.pop(); p !== undefined; p = pending.pop()) {
      if (this.positions[p]?.globstar && !states.has(p + 1)) {
        states.add(p + 1);
        pending.push(p + 1);
      }
    }
    return [...states].sort((a, b) => a - b);
  }
}

/**
 * Class parses for the pattern being scanned. Brace, alternation, and syntax scans skip the
 * same classes repeatedly, and an unclosed `[` scans to the end of its segment, so each
 * `[` is parsed once per pattern rather than once per scan.
 */
let classCache: { text: string; parsed: Map<number, ParsedClass | null> } | undefined;

function classAt(text: string, i: number): ParsedClass | undefined {
  if (classCache?.text !== text) {
    classCache = { text, parsed: new Map() };
  }
  let parsed = classCache.parsed.get(i);
  if (parsed === undefined) {
    parsed = parseClass(text, i) ?? null;
    classCache.parsed.set(i, parsed);
  }
  return parsed ?? undefined;
}

/** Index just past an escape or a class at `i`, or `i + 1` for any other character. */
function skipAt(text: string, i: number, end: number): number {
  if (text[i] === '\\') {
    return Math.min(i + 2, end);
  }
  if (text[i] === '[') {
    const parsed = classAt(text, i);
    if (parsed && parsed.end < end) {
      return parsed.end + 1;
    }
  }
  return i + 1;
}

/** Index of the `}` closing the `{` at `open`, or -1. */
function matchingBrace(text: string, open: number, end: number): number {
  let depth = 0;
  for (let i = open; i < end;) {
    const c = text[i];
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    } else if (c === '\\' || c === '[') {
      i = skipAt(text, i, end);
      continue;
    }
    i++;
  }
  return -1;
}

/** Split `text[start, end)` at commas outside nested braces, escapes, and classes. */
function splitTopLevel(text: string, start: number, end: number): [number, number][] {
  const parts: [number, number][] = [];
  let depth = 0;
  let from = start;
  for (let i = start; i < end;) {
    const c = text[i];
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
    } else if (c === ',' && depth === 0) {
      parts.push([from, i]);
      from = i + 1;
    } else if (c === '\\' || c === '[') {
      i = skipAt(text, i, end);
      continue;
    }
    i++;
  }
  parts.push([from, end]);
  return parts;
}

/** Literal text, or a group of alternative sequences. */
type BraceNode = string | BraceNode[][];

/**
 * Parse brace groups as bash does: a group needs a top-level comma, and a group without one
 * (`{a}`) or without a closing brace is literal text whose contents may still hold groups.
 */
function parseBraces(text: string, start: number, end: number, depth = 0): BraceNode[] {
  if (depth > MAX_BRACE_DEPTH) {
    throw new Error(
      `Test pattern "${text}" nests braces more than ${MAX_BRACE_DEPTH} deep. ` +
        'Split it into simpler patterns.',
    );
  }
  const nodes: BraceNode[] = [];
  let literal = '';
  for (let i = start; i < end;) {
    const c = text[i];
    if (c === '{') {
      const close = matchingBrace(text, i, end);
      const parts = close === -1 ? [] : splitTopLevel(text, i + 1, close);
      if (parts.length > 1) {
        if (literal !== '') {
          nodes.push(literal);
          literal = '';
        }
        nodes.push(parts.map(([from, to]) => parseBraces(text, from, to, depth + 1)));
        i = close + 1;
        continue;
      }
    }
    const next = c === '\\' || c === '[' ? skipAt(text, i, end) : i + 1;
    literal += text.slice(i, next);
    i = next;
  }
  if (literal !== '') {
    nodes.push(literal);
  }
  return nodes;
}

/** Number of expansions, saturating just above the cap so huge products stay cheap. */
function countExpansions(nodes: readonly BraceNode[]): number {
  let product = 1;
  for (const node of nodes) {
    if (typeof node === 'string') {
      continue;
    }
    let sum = 0;
    for (const alternative of node) {
      sum = Math.min(sum + countExpansions(alternative), MAX_BRACE_ALTERNATIVES + 1);
    }
    product = Math.min(product * sum, MAX_BRACE_ALTERNATIVES + 1);
  }
  return product;
}

function generate(nodes: readonly BraceNode[]): string[] {
  let results = [''];
  for (const node of nodes) {
    const options = typeof node === 'string' ? [node] : node.flatMap(generate);
    results = results.flatMap((prefix) => options.map((option) => prefix + option));
  }
  return results;
}

/**
 * Expand brace alternatives: `a/{b,c}/d` becomes `a/b/d` and `a/c/d`. Escapes and classes are
 * kept for segment matching. Throws before generating anything when the pattern is too long,
 * nests braces too deeply, or would expand to more than {@link MAX_BRACE_ALTERNATIVES}
 * alternatives.
 */
export function expandBraces(pattern: string): string[] {
  assertPatternLength(pattern);
  const nodes = parseBraces(pattern, 0, pattern.length);
  if (countExpansions(nodes) > MAX_BRACE_ALTERNATIVES) {
    throw new Error(
      `Test pattern "${pattern}" expands to more than ${MAX_BRACE_ALTERNATIVES} ` +
        'brace alternatives. Split it into simpler patterns.',
    );
  }
  return [...new Set(generate(nodes))];
}

/**
 * The text of a parenthesized group starting at `open` that holds a top-level `|`, which
 * picomatch read as a regular-expression alternation; undefined for any other `(`.
 */
function alternationGroup(text: string, open: number): string | undefined {
  let depth = 0;
  let alternates = false;
  for (let i = open; i < text.length;) {
    const c = text[i];
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return alternates ? text.slice(open, i + 1) : undefined;
      }
    } else if (c === '|' && depth === 1) {
      alternates = true;
    } else if (c === '\\' || c === '[') {
      i = skipAt(text, i, text.length);
      continue;
    }
    i++;
  }
  return undefined;
}

/** Syntax picomatch accepted that tryscript rejects, with how to rewrite it. */
export interface UnsupportedSyntax {
  syntax: string;
  hint: string;
}

/**
 * Find extended-glob or brace-range syntax, ignoring escaped characters and class contents.
 * Both were picomatch features; rejecting them loudly keeps a pattern from silently
 * selecting different files.
 */
export function findUnsupportedSyntax(pattern: string): UnsupportedSyntax | undefined {
  assertPatternLength(pattern);
  for (let i = 0; i < pattern.length;) {
    const c = pattern[i] ?? '';
    if (c === '\\' || c === '[') {
      const next = skipAt(pattern, i, pattern.length);
      if (next !== i + 1 || c === '\\') {
        i = next;
        continue;
      }
    }
    if ('@!+*?'.includes(c) && pattern[i + 1] === '(') {
      return {
        syntax: `extended glob syntax "${c}("`,
        hint: 'Use brace alternatives such as {a,b} instead, or escape the parenthesis as \\( to match it literally.',
      };
    }
    if (c === '(') {
      const alternation = alternationGroup(pattern, i);
      if (alternation !== undefined) {
        return {
          syntax: `the alternation group "${alternation}"`,
          hint: 'Use brace alternatives such as {a,b} instead, or escape the parenthesis as \\( to match it literally.',
        };
      }
    }
    if (c === '{') {
      const close = matchingBrace(pattern, i, pattern.length);
      const body = close === -1 ? '' : pattern.slice(i + 1, close);
      if (
        close !== -1 &&
        splitTopLevel(pattern, i + 1, close).length === 1 &&
        BRACE_RANGE.test(body)
      ) {
        return {
          syntax: `the brace range "{${body}}"`,
          hint: 'List the alternatives instead, as in {1,2,3}.',
        };
      }
    }
    i++;
  }
  return undefined;
}
