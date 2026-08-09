import stripAnsi from 'strip-ansi';
import type { WildcardCapture, WildcardCategory } from './types.js';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Marker prefix for patterns (uses Unicode private use chars that won't appear in normal output)
const MARKER = '\uE000';

/**
 * Metadata for a capturing group inside a regex built by `patternToCapturingRegex()`.
 */
interface CaptureGroupMeta {
  category: WildcardCategory;
  name?: string;
  multiline: boolean;
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
  customPatterns: Record<string, string | RegExp> = {},
): RegExp {
  // Build a map of markers to their regex replacements
  const replacements = new Map<string, string>();
  let markerIndex = 0;

  const getMarker = (): string => {
    return `${MARKER}${markerIndex++}${MARKER}`;
  };

  let processed = expected;

  // Replace [..] with marker
  const dotdotMarker = getMarker();
  replacements.set(dotdotMarker, '[^\\n]*');
  processed = processed.replaceAll('[..]', dotdotMarker);

  // Replace [??] with marker (unknown single-line, same regex as [..])
  const unknownDotdotMarker = getMarker();
  replacements.set(unknownDotdotMarker, '[^\\n]*');
  processed = processed.replaceAll('[??]', unknownDotdotMarker);

  // Replace ... (followed by newline) with marker
  const ellipsisMarker = getMarker();
  replacements.set(ellipsisMarker, '(?:[^\\n]*\\n)*');
  processed = processed.replace(/\.\.\.\n/g, ellipsisMarker);

  // Replace ??? (followed by newline) with marker (unknown multi-line, same regex as ...)
  const unknownEllipsisMarker = getMarker();
  replacements.set(unknownEllipsisMarker, '(?:[^\\n]*\\n)*');
  processed = processed.replace(/\?\?\?\n/g, unknownEllipsisMarker);

  // Replace [EXE] with marker
  const exeMarker = getMarker();
  const exe = process.platform === 'win32' ? '\\.exe' : '';
  replacements.set(exeMarker, exe);
  processed = processed.replaceAll('[EXE]', exeMarker);

  // Replace custom patterns with markers
  for (const [name, pattern] of Object.entries(customPatterns)) {
    const placeholder = `[${name}]`;
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    const marker = getMarker();
    replacements.set(marker, `(${patternStr})`);
    processed = processed.replaceAll(placeholder, marker);
  }

  // Escape special regex characters
  let regex = escapeRegex(processed);

  // Restore markers to their regex replacements. The replacement is passed as a
  // function so that `$&`, `` $` ``, `$'`, and `$<` inside a custom pattern are
  // inserted literally instead of being expanded by `replaceAll`.
  for (const [marker, replacement] of replacements) {
    regex = regex.replaceAll(escapeRegex(marker), () => replacement);
  }

  // Match the entire string (dotall mode for . to match newlines if needed)
  return new RegExp(`^${regex}$`, 's');
}

/**
 * Pre-process expected output to replace path placeholders with actual paths.
 * This happens BEFORE pattern matching.
 */
function preprocessPaths(expected: string, context: { root: string; cwd: string }): string {
  let result = expected;
  // Normalize paths for comparison (use forward slashes)
  const normalizedRoot = context.root.replace(/\\/g, '/');
  const normalizedCwd = context.cwd.replace(/\\/g, '/');
  result = result.replaceAll('[ROOT]', normalizedRoot);
  result = result.replaceAll('[CWD]', normalizedCwd);
  return result;
}

/**
 * Normalize actual output for comparison.
 * - Remove ANSI escape codes (colors, etc.)
 * - Normalize line endings to \n
 * - Normalize paths (Windows backslashes to forward slashes)
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
 * Each occurrence gets a unique marker so that the `groups` array is ordered
 * by position in the string, matching the regex capture group indices.
 */
function patternToCapturingRegex(
  expected: string,
  customPatterns: Record<string, string | RegExp> = {},
): { regex: RegExp; groups: CaptureGroupMeta[] } {
  const replacements = new Map<string, string>();
  // Maps marker string -> its CaptureGroupMeta (or null for non-capture markers)
  const markerMeta = new Map<string, CaptureGroupMeta | null>();
  let markerIndex = 0;

  const getMarker = (): string => {
    return `${MARKER}${markerIndex++}${MARKER}`;
  };

  // Replace each occurrence individually to maintain position ordering.
  const replaceEach = (
    processed: string,
    pattern: string | RegExp,
    regexStr: string,
    meta: CaptureGroupMeta | null,
  ): string => {
    let result = processed;
    if (typeof pattern === 'string') {
      while (result.includes(pattern)) {
        const marker = getMarker();
        replacements.set(marker, regexStr);
        markerMeta.set(marker, meta);
        result = result.replace(pattern, marker);
      }
    } else {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(result)) !== null) {
        const marker = getMarker();
        replacements.set(marker, regexStr);
        markerMeta.set(marker, meta);
        result = result.slice(0, m.index) + marker + result.slice(m.index + m[0].length);
      }
    }
    return result;
  };

  let processed = expected;

  // [..] — generic single-line
  processed = replaceEach(processed, '[..]', '([^\\n]*)', {
    category: 'generic',
    multiline: false,
  });

  // [??] — unknown single-line
  processed = replaceEach(processed, '[??]', '([^\\n]*)', {
    category: 'unknown',
    multiline: false,
  });

  // ... — generic multi-line (must be followed by newline)
  processed = replaceEach(processed, /\.\.\.\n/, '((?:[^\\n]*\\n)*)', {
    category: 'generic',
    multiline: true,
  });

  // ??? — unknown multi-line (must be followed by newline)
  processed = replaceEach(processed, /\?\?\?\n/, '((?:[^\\n]*\\n)*)', {
    category: 'unknown',
    multiline: true,
  });

  // [EXE] — no capture
  const exe = process.platform === 'win32' ? '\\.exe' : '';
  processed = replaceEach(processed, '[EXE]', exe, null);

  // Custom named patterns
  for (const [name, pattern] of Object.entries(customPatterns)) {
    const placeholder = `[${name}]`;
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    processed = replaceEach(processed, placeholder, `(${patternStr})`, {
      category: 'named',
      name,
      multiline: false,
    });
  }

  // Sort markers by their position in the processed string so that
  // the groups array matches the left-to-right capture group order.
  const sortedEntries = [...replacements.entries()].sort((a, b) => {
    return processed.indexOf(a[0]) - processed.indexOf(b[0]);
  });

  let regex = escapeRegex(processed);
  const groups: CaptureGroupMeta[] = [];
  for (const [marker, replacement] of sortedEntries) {
    const meta = markerMeta.get(marker);
    if (meta) {
      groups.push(meta);
    }
    // Function replacement: see `patternToRegex()` for why.
    regex = regex.replaceAll(escapeRegex(marker), () => replacement);
  }

  return { regex: new RegExp(`^${regex}$`, 's'), groups };
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

  const preprocessed = preprocessPaths(normalizedExpected, context);
  const regex = patternToRegex(preprocessed, customPatterns);
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

  const preprocessed = preprocessPaths(normalizedExpected, context);
  const { regex, groups } = patternToCapturingRegex(preprocessed, customPatterns);
  const match = regex.exec(normalizedActual);

  if (!match) {
    return null;
  }

  const captures: WildcardCapture[] = groups.map((meta, i) => ({
    category: meta.category,
    name: meta.name,
    multiline: meta.multiline,
    captured: match[i + 1] ?? '',
  }));

  return { captures };
}
