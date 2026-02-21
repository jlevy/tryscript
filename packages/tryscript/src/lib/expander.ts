import { writeFile } from 'atomically';
import { matchAndCapture, normalizeOutput } from './matcher.js';
import type {
  ExpandLevel,
  ExpansionResult,
  TestFile,
  TestBlockResult,
  WildcardCategory,
} from './types.js';

/**
 * Whether a wildcard category should be expanded at the given level.
 *
 * The hierarchy is: unknown < generic < all.
 */
export function shouldExpandCategory(category: WildcardCategory, level: ExpandLevel): boolean {
  switch (level) {
    case 'unknown':
      return category === 'unknown';
    case 'generic':
      return category === 'unknown' || category === 'generic';
    case 'all':
      return true;
  }
}

// Wildcard token patterns in the order they should be searched.
// Multi-line variants must include the trailing newline.
const WILDCARD_TOKENS: {
  token: string | RegExp;
  category: WildcardCategory;
  multiline: boolean;
}[] = [
  { token: '[..]', category: 'generic', multiline: false },
  { token: '[??]', category: 'unknown', multiline: false },
  { token: /\.\.\.\n/, category: 'generic', multiline: true },
  { token: /\?\?\?\n/, category: 'unknown', multiline: true },
];

/**
 * Expand wildcards in expected output by replacing them with captured actual text.
 *
 * Only wildcards whose category is targeted by `level` are replaced; others are
 * left intact. Returns `null` if actual output doesn't match expected pattern.
 */
export function expandExpectedOutput(
  expected: string,
  actual: string,
  context: { root: string; cwd: string },
  level: ExpandLevel,
  customPatterns?: Record<string, string | RegExp>,
): ExpansionResult | null {
  const normalizedExpected = normalizeOutput(expected);
  const normalizedActual = normalizeOutput(actual);

  if (normalizedExpected === '' && normalizedActual === '') {
    return { expandedOutput: '', captures: [], expandedCount: 0 };
  }

  const result = matchAndCapture(actual, expected, context, customPatterns);
  if (!result) {
    return null;
  }

  // Find all wildcard token positions, sort by position to match the
  // left-to-right capture order from matchAndCapture(), then assign captures.
  let output = normalizedExpected;
  let expandedCount = 0;

  const tokenPositions: { pos: number; length: number }[] = [];

  // Find positions of built-in wildcard tokens.
  for (const wt of WILDCARD_TOKENS) {
    let searchFrom = 0;
    if (typeof wt.token === 'string') {
      while (true) {
        const pos = output.indexOf(wt.token, searchFrom);
        if (pos === -1) {
          break;
        }
        tokenPositions.push({ pos, length: wt.token.length });
        searchFrom = pos + wt.token.length;
      }
    } else {
      const re = new RegExp(wt.token.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(output)) !== null) {
        tokenPositions.push({ pos: m.index, length: m[0].length });
      }
    }
  }

  // Find positions of named custom pattern tokens.
  if (customPatterns) {
    for (const name of Object.keys(customPatterns)) {
      const placeholder = `[${name}]`;
      let searchFrom = 0;
      while (true) {
        const pos = output.indexOf(placeholder, searchFrom);
        if (pos === -1) {
          break;
        }
        tokenPositions.push({ pos, length: placeholder.length });
        searchFrom = pos + placeholder.length;
      }
    }
  }

  // Sort by position (left-to-right) to match matchAndCapture() capture order.
  tokenPositions.sort((a, b) => a.pos - b.pos);

  // Assign captures in position order.
  const replacements = tokenPositions.map((tp, i) => ({
    ...tp,
    capture: result.captures[i]!,
  }));

  // Apply replacements in reverse to maintain offsets.
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i]!;
    if (shouldExpandCategory(r.capture.category, level)) {
      const replacement = r.capture.captured;
      // Multi-line captures already include trailing newlines from the regex;
      // the token also consumed the trailing newline, so this is 1:1.
      output = output.slice(0, r.pos) + replacement + output.slice(r.pos + r.length);
      expandedCount++;
    }
  }

  return { expandedOutput: output, captures: result.captures, expandedCount };
}

/**
 * Expand wildcards in a test file in place.
 *
 * Uses the same reverse-order strategy as `updater.ts` to maintain correct
 * string offsets when modifying multiple blocks.
 */
export async function expandTestFile(
  file: TestFile,
  results: TestBlockResult[],
  level: ExpandLevel,
  context: { root: string; cwd: string },
  customPatterns?: Record<string, string | RegExp>,
): Promise<{ expanded: boolean; expandedCount: number; changes: string[] }> {
  let content = file.rawContent;
  const changes: string[] = [];
  let totalExpanded = 0;

  // Process blocks in reverse order to maintain correct offsets
  const blocksWithResults = file.blocks
    .map((block, i) => ({ block, result: results[i] }))
    .reverse();

  for (const { block, result } of blocksWithResults) {
    if (!result || !block.expectedOutput) {
      continue;
    }

    const expansion = expandExpectedOutput(
      block.expectedOutput,
      result.actualOutput,
      context,
      level,
      customPatterns,
    );

    if (!expansion || expansion.expandedCount === 0) {
      continue;
    }

    // Rebuild the block with expanded expected output
    const commandLines = block.command.split('\n').map((line, i) => {
      return i === 0 ? `$ ${line}` : `> ${line}`;
    });

    const lines: string[] = ['```console', ...commandLines];
    const trimmedOutput = expansion.expandedOutput.trimEnd();
    if (trimmedOutput) {
      lines.push(trimmedOutput);
    }
    lines.push(`? ${block.expectedExitCode ?? result.actualExitCode}`, '```');

    const newBlockContent = lines.join('\n');
    const blockStart = content.indexOf(block.rawContent);
    if (blockStart !== -1) {
      content =
        content.slice(0, blockStart) +
        newBlockContent +
        content.slice(blockStart + block.rawContent.length);
      changes.push(block.name ?? `Line ${block.lineNumber}`);
      totalExpanded += expansion.expandedCount;
    }
  }

  if (changes.length > 0) {
    await writeFile(file.path, content);
  }

  return { expanded: changes.length > 0, expandedCount: totalExpanded, changes };
}
