import stripAnsi from 'strip-ansi';
import type { WildcardCapture, WildcardCategory } from './types.js';
import { BUILT_IN_PATTERN_NAMES } from './types.js';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Base for temporary markers; compilation lengthens it until it is absent from the input.
const MARKER = '\uE000';

/**
 * Metadata for a capturing group inside a regex built by `patternToCapturingRegex()`.
 */
interface CaptureGroupSpec {
  category: WildcardCategory;
  name?: string;
  multiline: boolean;
}

interface CaptureGroupMeta extends CaptureGroupSpec {
  captureName: string;
}

interface ReplacementSpec {
  regexSource: string;
  capture: CaptureGroupSpec | null;
  customPatternName: string | null;
  occurrence: number;
}

function countCapturingGroups(source: string): number {
  let count = 0;
  let inCharacterClass = false;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      index++;
      continue;
    }
    if (character === '[') {
      inCharacterClass = true;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (character !== '(' || inCharacterClass) {
      continue;
    }

    if (source[index + 1] !== '?') {
      count++;
      continue;
    }
    if (source[index + 2] === '<' && source[index + 3] !== '=' && source[index + 3] !== '!') {
      count++;
    }
  }

  return count;
}

function pathToRegex(path: string): string {
  return path
    .split(/[\\/]/u)
    .map((component) => escapeRegex(component))
    .join('[\\\\/]');
}

function namespaceNamedGroups(source: string, occurrence: number, patternName: string): string {
  const renamed = new Map<string, string>();
  let inCharacterClass = false;

  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '\\') {
      index++;
      continue;
    }
    if (character === '[') {
      inCharacterClass = true;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      continue;
    }
    if (
      !inCharacterClass &&
      source.startsWith('(?<', index) &&
      source[index + 3] !== '=' &&
      source[index + 3] !== '!'
    ) {
      const nameEnd = source.indexOf('>', index + 3);
      if (nameEnd !== -1) {
        const name = source.slice(index + 3, nameEnd);
        if (!renamed.has(name)) {
          renamed.set(name, `tryscriptPattern${occurrence}Group${renamed.size}`);
        }
        index = nameEnd;
      }
    }
  }

  let result = '';
  inCharacterClass = false;
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (character === '\\') {
      if (!inCharacterClass && source.startsWith('\\k<', index)) {
        const nameEnd = source.indexOf('>', index + 3);
        if (nameEnd !== -1) {
          const name = source.slice(index + 3, nameEnd);
          const replacement = renamed.get(name);
          if (replacement === undefined) {
            if (renamed.size > 0) {
              throw new Error(
                `Custom pattern [${patternName}] references undefined named group '${name}'`,
              );
            }
            result += escapeRegex(`k<${name}>`);
            index = nameEnd + 1;
            continue;
          }
          result += `\\k<${replacement}>`;
          index = nameEnd + 1;
          continue;
        }
      }
      result += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === '[') {
      inCharacterClass = true;
    } else if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
    }
    if (
      !inCharacterClass &&
      source.startsWith('(?<', index) &&
      source[index + 3] !== '=' &&
      source[index + 3] !== '!'
    ) {
      const nameEnd = source.indexOf('>', index + 3);
      if (nameEnd !== -1) {
        const name = source.slice(index + 3, nameEnd);
        const replacement = renamed.get(name);
        if (replacement !== undefined) {
          result += `(?<${replacement}>`;
          index = nameEnd + 1;
          continue;
        }
      }
    }
    result += character;
    index++;
  }

  return result;
}

function legacyDecimalEscape(rawDigits: string): string {
  const firstDigit = Number(rawDigits[0]);
  if (firstDigit >= 8) {
    return rawDigits;
  }

  const maximumOctalDigits = firstDigit <= 3 ? 3 : 2;
  let octalLength = 1;
  while (
    octalLength < maximumOctalDigits &&
    octalLength < rawDigits.length &&
    /[0-7]/u.test(rawDigits[octalLength]!)
  ) {
    octalLength++;
  }

  const value = Number.parseInt(rawDigits.slice(0, octalLength), 8);
  const explicitEscape =
    value <= 0xff
      ? `\\x${value.toString(16).padStart(2, '0')}`
      : `\\u${value.toString(16).padStart(4, '0')}`;
  return explicitEscape + rawDigits.slice(octalLength);
}

function offsetNumericBackreferences(
  source: string,
  offset: number,
  localCaptureCount: number,
): string {
  let result = '';
  let inCharacterClass = false;
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (character === '[') {
      inCharacterClass = true;
      result += character;
      index++;
      continue;
    }
    if (character === ']' && inCharacterClass) {
      inCharacterClass = false;
      result += character;
      index++;
      continue;
    }
    if (character !== '\\' || inCharacterClass || !/[1-9]/u.test(source[index + 1] ?? '')) {
      if (character === '\\') {
        result += source.slice(index, index + 2);
        index += 2;
      } else {
        result += character;
        index++;
      }
      continue;
    }

    let end = index + 1;
    while (/\d/u.test(source[end] ?? '')) {
      end++;
    }
    const rawReference = source.slice(index + 1, end);
    const reference = Number(rawReference);
    result +=
      reference <= localCaptureCount
        ? `\\${reference + offset}`
        : legacyDecimalEscape(rawReference);
    index = end;
  }

  return result;
}

function compilePattern(
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp>,
  captureWildcards: boolean,
): { regex: RegExp; groups: CaptureGroupMeta[] } {
  const replacements = new Map<string, ReplacementSpec>();
  let markerPrefix = MARKER;
  while (expected.includes(markerPrefix)) {
    markerPrefix += MARKER;
  }
  let markerIndex = 0;
  let occurrence = 0;

  const registerReplacement = (
    regexSource: string,
    capture: CaptureGroupSpec | null,
    customPatternName: string | null = null,
  ): string => {
    const marker = `${markerPrefix}${markerIndex++}${markerPrefix}`;
    replacements.set(marker, {
      regexSource,
      capture,
      customPatternName,
      occurrence: occurrence++,
    });
    return marker;
  };

  const replaceEach = (
    processed: string,
    pattern: string | RegExp,
    regexSource: string,
    capture: CaptureGroupSpec | null,
    customPatternName: string | null = null,
  ): string => {
    let result = processed;
    if (typeof pattern === 'string') {
      while (result.includes(pattern)) {
        result = result.replace(
          pattern,
          registerReplacement(regexSource, capture, customPatternName),
        );
      }
      return result;
    }

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(result)) !== null) {
      const marker = registerReplacement(regexSource, capture, customPatternName);
      result = result.slice(0, match.index) + marker + result.slice(match.index + match[0].length);
    }
    return result;
  };

  const capture = (spec: CaptureGroupSpec): CaptureGroupSpec | null =>
    captureWildcards ? spec : null;
  let processed = expected;

  // A line containing a path token is a portable path expression. Protect its
  // written separators before wildcard scanning so `/` in the golden also
  // matches `\` in Windows command output without rewriting captured text.
  processed = processed
    .split('\n')
    .map((line) => {
      if (!line.includes('[ROOT]') && !line.includes('[CWD]')) {
        return line;
      }
      return line.replace(/[\\/]/gu, () => registerReplacement('[\\\\/]', null));
    })
    .join('\n');

  // Protect path values before looking for wildcard-like text inside them.
  processed = replaceEach(processed, '[ROOT]', pathToRegex(context.root), null);
  processed = replaceEach(processed, '[CWD]', pathToRegex(context.cwd), null);
  processed = replaceEach(
    processed,
    '[..]',
    '[^\\n]*',
    capture({ category: 'generic', multiline: false }),
  );
  processed = replaceEach(
    processed,
    '[??]',
    '[^\\n]*',
    capture({ category: 'unknown', multiline: false }),
  );
  processed = replaceEach(
    processed,
    /\.\.\.\n/,
    '(?:[^\\n]*\\n)*',
    capture({ category: 'generic', multiline: true }),
  );
  processed = replaceEach(
    processed,
    /\?\?\?\n/,
    '(?:[^\\n]*\\n)*',
    capture({ category: 'unknown', multiline: true }),
  );
  processed = replaceEach(processed, '[EXE]', process.platform === 'win32' ? '\\.exe' : '', null);

  for (const [name, pattern] of Object.entries(customPatterns)) {
    if (BUILT_IN_PATTERN_NAMES.has(name)) {
      continue;
    }
    processed = replaceEach(
      processed,
      `[${name}]`,
      pattern instanceof RegExp ? pattern.source : pattern,
      capture({ category: 'named', name, multiline: false }),
      name,
    );
  }

  const ordered = [...replacements.entries()].sort(
    (left, right) => processed.indexOf(left[0]) - processed.indexOf(right[0]),
  );
  let regexSource = escapeRegex(processed);
  let precedingCaptureCount = 0;
  let wildcardCaptureIndex = 0;
  const groups: CaptureGroupMeta[] = [];

  for (const [marker, spec] of ordered) {
    let replacementSource = spec.regexSource;
    if (spec.customPatternName !== null) {
      replacementSource = namespaceNamedGroups(
        replacementSource,
        spec.occurrence,
        spec.customPatternName,
      );
    }
    const localCaptureCount = countCapturingGroups(replacementSource);
    if (spec.customPatternName !== null) {
      const wrapperOffset = spec.capture === null ? 0 : 1;
      replacementSource = offsetNumericBackreferences(
        replacementSource,
        precedingCaptureCount + wrapperOffset,
        localCaptureCount,
      );
      if (spec.capture === null) {
        replacementSource = `(?:${replacementSource})`;
      }
    }

    if (spec.capture !== null) {
      const meta: CaptureGroupMeta = {
        ...spec.capture,
        captureName: `tryscriptCapture${wildcardCaptureIndex++}`,
      };
      groups.push(meta);
      replacementSource = `(?<${meta.captureName}>${replacementSource})`;
      precedingCaptureCount++;
    }
    precedingCaptureCount += localCaptureCount;
    regexSource = regexSource.replaceAll(escapeRegex(marker), () => replacementSource);
  }

  return { regex: new RegExp(`^${regexSource}$`, 's'), groups };
}

/**
 * Convert expected output with elision patterns to a regex.
 *
 * Handles (matching trycmd):
 * - [..] — matches any characters on the same line (trycmd: [^\n]*?)
 * - ... — matches zero or more complete lines (trycmd: \n(([^\n]*\n)*)?)
 * - [EXE] — matches .exe on Windows, empty otherwise
 * - [ROOT] — replaced with test root directory (pre-processed)
 * - [CWD] — replaced with current working directory (pre-processed)
 * - Custom [NAME] patterns from config (trycmd: TestCases::insert_var)
 */
function patternToRegex(
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp> = {},
): RegExp {
  return compilePattern(expected, context, customPatterns, false).regex;
}

/**
 * Normalize actual output for comparison.
 * - Remove ANSI escape codes (colors, etc.)
 * - Normalize line endings to \n
 * - Trim trailing whitespace from lines
 * - Ensure single trailing newline
 */
export function normalizeOutput(output: string): string {
  // Remove ANSI escape codes first
  let normalized = stripAnsi(output);

  normalized = normalized
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    // `\n*` rather than `\n+`: expected output always ends with a newline, so output
    // that ends without one (a bare `process.stdout.write`) could otherwise never
    // match, and `--update` could not fix it either.
    .replace(/\n*$/, '\n');

  // Handle empty output
  if (normalized === '\n') {
    normalized = '';
  }

  return normalized;
}

/**
 * Like `patternToRegex()` but wraps each wildcard in a capturing group and
 * returns metadata describing what each group represents.
 *
 * Each occurrence receives a unique named group, so captures inside custom
 * regular expressions cannot shift later wildcard values.
 */
function patternToCapturingRegex(
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp> = {},
): { regex: RegExp; groups: CaptureGroupMeta[] } {
  return compilePattern(expected, context, customPatterns, true);
}

/**
 * Check if actual output matches expected pattern.
 */
export function matchOutput(
  actual: string,
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp> = {},
): boolean {
  const normalizedActual = normalizeOutput(actual);
  const normalizedExpected = normalizeOutput(expected);

  // Empty expected matches empty actual
  if (normalizedExpected === '' && normalizedActual === '') {
    return true;
  }

  const regex = patternToRegex(normalizedExpected, context, customPatterns);
  return regex.test(normalizedActual);
}

/**
 * Match actual output against expected pattern and return wildcard captures.
 * Returns `null` if the output does not match.
 */
export function matchAndCapture(
  actual: string,
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp> = {},
): { captures: WildcardCapture[] } | null {
  const normalizedActual = normalizeOutput(actual);
  const normalizedExpected = normalizeOutput(expected);

  if (normalizedExpected === '' && normalizedActual === '') {
    return { captures: [] };
  }

  const { regex, groups } = patternToCapturingRegex(normalizedExpected, context, customPatterns);
  const match = regex.exec(normalizedActual);

  if (!match) {
    return null;
  }

  const captures: WildcardCapture[] = groups.map((meta) => ({
    category: meta.category,
    ...(meta.name === undefined ? {} : { name: meta.name }),
    multiline: meta.multiline,
    captured: match.groups?.[meta.captureName] ?? '',
  }));

  return { captures };
}
