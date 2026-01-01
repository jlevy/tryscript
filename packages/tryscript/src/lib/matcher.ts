/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  // First, handle custom patterns BEFORE escaping (they may contain special chars)
  let processed = expected;
  for (const [name, pattern] of Object.entries(customPatterns)) {
    const placeholder = `[${name}]`;
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    // Replace placeholders with a unique marker that won't be escaped
    processed = processed.replaceAll(placeholder, `\x00CUSTOM:${name}:${patternStr}\x00`);
  }

  // Escape special regex characters
  let regex = escapeRegex(processed);

  // Restore custom patterns (the markers were escaped, so unescape them)
  regex = regex.replace(/\\x00CUSTOM:([^:]+):([^\\]+)\\x00/g, '($2)');

  // [..] matches any characters on the line (non-greedy, stops at newline)
  // After escaping, [..] becomes \[\.\.\]
  regex = regex.replace(/\\\[\\\.\\\.\\\]/g, '[^\\n]*');

  // ... matches zero or more complete lines (including the newline after ...)
  // After escaping, ... becomes \.\.\.
  // Match: optional content before newline, then zero or more complete lines
  regex = regex.replace(/\\\.\\\.\\\.(\r?\\n)?/g, '(?:[^\\n]*\\n)*');

  // [EXE] platform-specific executable extension
  // After escaping, [EXE] becomes \[EXE\]
  const exe = process.platform === 'win32' ? '\\.exe' : '';
  regex = regex.replace(/\\\[EXE\\\]/g, exe);

  // Match the entire string (multiline mode for ^ and $ to match line boundaries)
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
 * - Normalize line endings to \n
 * - Normalize paths (Windows backslashes to forward slashes)
 * - Trim trailing whitespace from lines
 * - Ensure single trailing newline
 */
export function normalizeOutput(output: string): string {
  let normalized = output
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
