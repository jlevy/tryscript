import stripAnsi from 'strip-ansi';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Marker prefix for patterns (uses Unicode private use chars that won't appear in normal output)
const MARKER = '\uE000';

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

  // Replace ... (followed by newline) with marker
  const ellipsisMarker = getMarker();
  replacements.set(ellipsisMarker, '(?:[^\\n]*\\n)*');
  processed = processed.replace(/\.\.\.\n/g, ellipsisMarker);

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

  // Restore markers to their regex replacements
  for (const [marker, replacement] of replacements) {
    regex = regex.replaceAll(escapeRegex(marker), replacement);
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
    .replace(/\n+$/, '\n');

  // Handle empty output
  if (normalized === '\n') {
    normalized = '';
  }

  return normalized;
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
