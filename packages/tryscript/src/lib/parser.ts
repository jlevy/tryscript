import { parse as parseYaml } from 'yaml';
import type { ZodIssue } from 'zod';
import type { TestConfig, TestBlock, TestFile } from './types.js';
import { BUILT_IN_PATTERN_NAMES, TestConfigSchema } from './types.js';

const FRONTMATTER_DELIMITER_REGEX = /^---(?:\r?\n|$)/;
const FRONTMATTER_OPEN_REGEX = /^---\r?\n/;
const FRONTMATTER_CLOSE_REGEX = /^---(?:\r?\n|$)/m;
const FRONTMATTER_LINE_OFFSET = 1;
const FIRST_FRONTMATTER_CONTENT_LINE = 2;

/** Regex to match a single Markdown heading line (for test names). */
const HEADING_REGEX = /^#+\s+(?:Test:\s*)?(.+)$/;

/** Regex to match skip annotation in heading or nearby HTML comment */
const SKIP_ANNOTATION_REGEX = /<!--\s*skip\s*-->/i;

/** Regex to match only annotation in heading or nearby HTML comment */
const ONLY_ANNOTATION_REGEX = /<!--\s*only\s*-->/i;

/**
 * A malformed test file, reported with the location of the offending line.
 *
 * Thrown instead of guessing, for input where any guess would silently run
 * something the author did not write.
 */
export class TestParseError extends Error {
  constructor(
    message: string,
    readonly filePath: string,
    readonly lineNumber: number,
    options?: ErrorOptions,
  ) {
    super(`${filePath}:${lineNumber}: ${message}`, options);
    this.name = 'TestParseError';
  }
}

/** A non-fatal problem with a test file's frontmatter. */
export interface ConfigWarning {
  /** Dotted path to the offending key, e.g. `env.NO_COLOR` */
  path: string;
  message: string;
}

function issueSpecificity(issue: ZodIssue): number {
  const unknownKeyBonus = issue.code === 'unrecognized_keys' ? 100 : 0;
  return unknownKeyBonus + issue.path.length;
}

/** Select the most useful branch of union validation failures for diagnostics. */
function actionableIssues(issue: ZodIssue): ZodIssue[] {
  if (issue.code !== 'invalid_union') {
    return [issue];
  }

  const candidates = issue.unionErrors.map((error) =>
    error.issues.flatMap((candidate) => actionableIssues(candidate)),
  );
  return candidates.reduce(
    (best, candidate) =>
      Math.max(...candidate.map(issueSpecificity)) > Math.max(...best.map(issueSpecificity))
        ? candidate
        : best,
    candidates[0] ?? [issue],
  );
}

function yamlErrorLine(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('linePos' in error)) {
    return FIRST_FRONTMATTER_CONTENT_LINE;
  }

  const linePositions: unknown = error.linePos;
  if (!Array.isArray(linePositions)) {
    return FIRST_FRONTMATTER_CONTENT_LINE;
  }

  const firstPosition: unknown = linePositions[0];
  if (
    typeof firstPosition !== 'object' ||
    firstPosition === null ||
    !('line' in firstPosition) ||
    typeof firstPosition.line !== 'number'
  ) {
    return FIRST_FRONTMATTER_CONTENT_LINE;
  }

  return firstPosition.line + FRONTMATTER_LINE_OFFSET;
}

interface CodeBlockMatch {
  fullMatch: string;
  infoString: string;
  content: string;
  /** Offset of the opening fence within the string that was scanned */
  index: number;
  /** Offset just past the closing fence within the string that was scanned */
  endIndex: number;
  /** 1-indexed line number of the opening fence within the scanned string */
  line: number;
  /** Most recent top-level Markdown heading. */
  name?: string;
  /** Top-level annotations after the most recent heading. */
  skip: boolean;
  only: boolean;
}

/**
 * Find console/bash fenced code blocks, supporting extended fences (4+ backticks).
 *
 * Non-executable fences are opaque: examples inside a Markdown or text fence
 * must not become executable tests. A closing fence uses the opening character
 * and has at least the opening width, following CommonMark.
 */
function findConsoleCodeBlocks(
  text: string,
  filePath: string,
  bodyLineOffset: number,
): CodeBlockMatch[] {
  const results: CodeBlockMatch[] = [];
  const lines = text.split('\n');

  const offsets: number[] = new Array<number>(lines.length);
  offsets[0] = 0;
  for (let j = 1; j < lines.length; j++) {
    offsets[j] = offsets[j - 1]! + lines[j - 1]!.length + 1;
  }

  let i = 0;
  let currentName: string | undefined;
  let currentSkip = false;
  let currentOnly = false;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    const openMatch = /^(`{3,}|~{3,})(.*)$/.exec(trimmed);

    if (!openMatch) {
      const headingMatch = HEADING_REGEX.exec(trimmed);
      if (headingMatch) {
        currentName = headingMatch[1]?.trim();
        currentSkip = SKIP_ANNOTATION_REGEX.test(trimmed);
        currentOnly = ONLY_ANNOTATION_REGEX.test(trimmed);
      } else if (currentName !== undefined) {
        currentSkip ||= SKIP_ANNOTATION_REGEX.test(trimmed);
        currentOnly ||= ONLY_ANNOTATION_REGEX.test(trimmed);
      }
      i++;
      continue;
    }

    const openingFence = openMatch[1]!;
    const fenceCharacter = openingFence[0]!;
    const fenceLen = openingFence.length;
    const infoString = openMatch[2]!.trim();
    const executable =
      fenceCharacter === '`' && (infoString === 'console' || infoString === 'bash');
    const openLineIdx = i;
    const closingRe = new RegExp(`^${fenceCharacter}{${fenceLen},}\\s*$`);
    let closed = false;

    i++;
    while (i < lines.length) {
      const cur = lines[i]!;
      const curTrimmed = cur.endsWith('\r') ? cur.slice(0, -1) : cur;
      if (closingRe.test(curTrimmed)) {
        if (executable) {
          const startOffset = offsets[openLineIdx]!;
          // Leave the closing line terminator outside the block. In CRLF files the
          // split line still contains `\r`; consuming it here would make a later
          // rewrite retain only the following `\n`.
          const endOffset = offsets[i]! + curTrimmed.length;
          const contentStart = offsets[openLineIdx + 1]!;
          const contentEnd = offsets[i]!;

          results.push({
            fullMatch: text.slice(startOffset, endOffset),
            infoString,
            content: text.slice(contentStart, contentEnd),
            index: startOffset,
            endIndex: endOffset,
            line: openLineIdx + 1,
            ...(currentName === undefined ? {} : { name: currentName }),
            skip: currentSkip,
            only: currentOnly,
          });
        }
        i++;
        closed = true;
        break;
      }
      i++;
    }

    if (!closed && executable) {
      throw new TestParseError(
        `unclosed ${infoString} code block`,
        filePath,
        openLineIdx + 1 + bodyLineOffset,
      );
    }
  }

  return results;
}

/**
 * Validate parsed frontmatter, returning warnings rather than throwing.
 *
 * Unknown and mistyped keys are reported but never fatal: a file that ran on an
 * earlier version must keep running, and a stray key is an authoring mistake worth
 * surfacing, not a reason to fail the suite.
 */
export function validateConfig(
  raw: unknown,
  options: { allowEmpty?: boolean } = {},
): ConfigWarning[] {
  if (raw === undefined || (raw === null && options.allowEmpty !== false)) {
    return [];
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [{ path: '', message: 'config must be a mapping' }];
  }

  const warnings: ConfigWarning[] = [];

  const known = new Set(Object.keys(TestConfigSchema.shape));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      warnings.push({ path: key, message: `unknown config key '${key}'` });
    }
  }

  const result = TestConfigSchema.safeParse(raw);
  if (!result.success) {
    for (const topLevelIssue of result.error.issues) {
      for (const issue of actionableIssues(topLevelIssue)) {
        if (issue.code === 'unrecognized_keys') {
          for (const key of issue.keys) {
            warnings.push({
              path: [...issue.path, key].join('.'),
              message: `unknown config key '${key}'`,
            });
          }
          continue;
        }

        const path = issue.path.join('.');
        // Unknown top-level keys are already reported above with a clearer message.
        if (path && known.has(String(issue.path[0]))) {
          warnings.push({ path, message: issue.message });
        }
      }
    }
  }

  const patterns = Reflect.get(raw, 'patterns') as unknown;
  if (patterns !== null && typeof patterns === 'object' && !Array.isArray(patterns)) {
    for (const [name, pattern] of Object.entries(patterns)) {
      if (BUILT_IN_PATTERN_NAMES.has(name)) {
        warnings.push({
          path: `patterns.${name}`,
          message: `custom pattern name '${name}' is reserved and ignored`,
        });
      }
      if (pattern instanceof RegExp && pattern.flags !== '') {
        warnings.push({
          path: `patterns.${name}`,
          message: `RegExp flags '${pattern.flags}' are ignored; custom patterns use source text only`,
        });
      }
    }
  }

  return warnings;
}

/**
 * Parse a .tryscript.md file into structured test data.
 *
 * @throws {TestParseError} if a console block is malformed.
 */
export function parseTestFile(content: string, filePath: string): TestFile {
  const rawContent = content;
  let config: TestConfig = {};
  let configWarnings: ConfigWarning[] = [];
  let body = content;
  // Offset of `body` within `content`, so block offsets index the raw file.
  let bodyOffset = 0;

  const frontmatterDelimiter = FRONTMATTER_DELIMITER_REGEX.exec(content);
  if (frontmatterDelimiter) {
    const openingDelimiter = FRONTMATTER_OPEN_REGEX.exec(content);
    if (!openingDelimiter) {
      throw new TestParseError('unclosed YAML frontmatter', filePath, 1);
    }

    const afterOpeningDelimiter = content.slice(openingDelimiter[0].length);
    const closingDelimiter = FRONTMATTER_CLOSE_REGEX.exec(afterOpeningDelimiter);
    if (!closingDelimiter) {
      throw new TestParseError('unclosed YAML frontmatter', filePath, 1);
    }

    const yamlContent = afterOpeningDelimiter.slice(0, closingDelimiter.index);
    let parsed: unknown;
    try {
      parsed = parseYaml(yamlContent);
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('\n', 1)[0] : String(error);
      throw new TestParseError(
        `invalid YAML frontmatter: ${detail}`,
        filePath,
        yamlErrorLine(error),
        { cause: error },
      );
    }
    configWarnings = validateConfig(parsed);
    config = parsed ?? {};
    bodyOffset = openingDelimiter[0].length + closingDelimiter.index + closingDelimiter[0].length;
    body = content.slice(bodyOffset);
  }

  // Number of lines consumed by the frontmatter, so block line numbers stay
  // relative to the whole file.
  const bodyLineOffset = bodyOffset === 0 ? 0 : content.slice(0, bodyOffset).split('\n').length - 1;

  // Parse all console blocks (supports extended fences with 4+ backticks)
  const blocks: TestBlock[] = [];
  const codeBlocks = findConsoleCodeBlocks(body, filePath, bodyLineOffset);

  for (const codeBlock of codeBlocks) {
    const lineNumber = codeBlock.line + bodyLineOffset;

    // Parse the block content
    const parsed = parseBlockContent(codeBlock.content, filePath, lineNumber, codeBlock.infoString);
    blocks.push({
      ...(codeBlock.name === undefined ? {} : { name: codeBlock.name }),
      command: parsed.command,
      expectedOutput: parsed.expectedOutput,
      ...(parsed.expectedStderr === undefined ? {} : { expectedStderr: parsed.expectedStderr }),
      expectedExitCode: parsed.expectedExitCode,
      lineNumber,
      rawContent: codeBlock.fullMatch,
      startOffset: bodyOffset + codeBlock.index,
      endOffset: bodyOffset + codeBlock.endIndex,
      infoString: codeBlock.infoString,
      skip: codeBlock.skip,
      only: codeBlock.only,
    });
  }

  return { path: filePath, config, configWarnings, blocks, rawContent };
}

/**
 * Parse the content of a single console block.
 *
 * @param content - Block body, without the fences
 * @param filePath - Test file path, for error messages
 * @param blockLine - 1-indexed line of the opening fence, for error messages
 * @param infoString - Executable fence language (`console` or `bash`)
 */
function parseBlockContent(
  content: string,
  filePath: string,
  blockLine: number,
  infoString: string,
): {
  command: string;
  expectedOutput: string;
  expectedStderr?: string;
  expectedExitCode: number;
} {
  const lines = content.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  const commandLines: string[] = [];
  const outputLines: string[] = [];
  const stderrLines: string[] = [];
  let expectedExitCode = 0;
  let inCommand = false;
  let sawExitCode = false;
  let sawPrompt = false;

  // Line numbers within the block body start just after the opening fence.
  const lineNumberOf = (index: number): number => blockLine + 1 + index;

  for (const [index, line] of lines.entries()) {
    if (line.startsWith('$ ')) {
      // Start of a command. One command per block: concatenating a second prompt
      // would build an invocation the author never wrote, so reject it instead.
      if (sawPrompt) {
        throw new TestParseError(
          `a ${infoString} code block may contain only one \`$ \` command prompt; ` +
            `put the second command in its own ${infoString} code block`,
          filePath,
          lineNumberOf(index),
        );
      }
      sawPrompt = true;
      inCommand = true;
      commandLines.push(line.slice(2));
    } else if (line.startsWith('> ') && inCommand) {
      // Continuation of a multi-line command
      commandLines.push(line.slice(2));
    } else if (line.startsWith('? ')) {
      // Exit code specification. A bare `?` stays stdout: unlike `!` (issue #45) it
      // has no meaning to gain, and reinterpreting it would break files that print
      // a literal `?` line.
      inCommand = false;
      if (sawExitCode) {
        throw new TestParseError(
          `a ${infoString} code block may specify \`? \` (expected exit code) only once`,
          filePath,
          lineNumberOf(index),
        );
      }
      sawExitCode = true;
      const raw = line.slice(1).trim();
      if (!/^\d+$/.test(raw)) {
        throw new TestParseError(
          `expected exit code must be a non-negative integer, got '${raw}'`,
          filePath,
          lineNumberOf(index),
        );
      }
      expectedExitCode = parseInt(raw, 10);
    } else if (line === '!' || line.startsWith('! ')) {
      // Stderr line (prefixed with !). A bare `!` is an empty stderr line; spelling
      // it `! ` would depend on trailing whitespace that editors strip.
      inCommand = false;
      stderrLines.push(line.slice(2));
    } else {
      // Output line (stdout or combined)
      inCommand = false;
      outputLines.push(line);
    }
  }

  if (commandLines.length === 0) {
    throw new TestParseError(
      `${infoString} code block must contain a \`$ \` command prompt`,
      filePath,
      blockLine,
    );
  }

  // Join command lines, handling shell continuations
  let command = '';
  for (let i = 0; i < commandLines.length; i++) {
    const line = commandLines[i] ?? '';
    if (line.endsWith('\\')) {
      command += line.slice(0, -1) + ' ';
    } else {
      command += line;
      if (i < commandLines.length - 1) {
        command += ' ';
      }
    }
  }

  // Join output lines, preserving blank lines but trimming trailing empty lines
  let expectedOutput = outputLines.join('\n');
  expectedOutput = expectedOutput.replace(/\n+$/, '');
  if (expectedOutput) {
    expectedOutput += '\n';
  }

  // Join stderr lines if any
  let expectedStderr: string | undefined;
  if (stderrLines.length > 0) {
    expectedStderr = stderrLines.join('\n');
    expectedStderr = expectedStderr.replace(/\n+$/, '');
    if (expectedStderr) {
      expectedStderr += '\n';
    }
  }

  return {
    command: command.trim(),
    expectedOutput,
    ...(expectedStderr === undefined ? {} : { expectedStderr }),
    expectedExitCode,
  };
}
