import { parse as parseYaml } from 'yaml';
import type { TestConfig, TestBlock, TestFile } from './types.js';
import { FrontmatterSchema } from './types.js';

/** Regex to match YAML frontmatter at the start of a file */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** Regex to match markdown headings (for test names) */
const HEADING_REGEX = /^#+\s+(?:Test:\s*)?(.+)$/m;

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
  ) {
    super(`${filePath}:${lineNumber}: ${message}`);
    this.name = 'TestParseError';
  }
}

/** A non-fatal problem with a test file's frontmatter. */
export interface ConfigWarning {
  /** Dotted path to the offending key, e.g. `env.NO_COLOR` */
  path: string;
  message: string;
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
}

/**
 * Find console/bash fenced code blocks, supporting extended fences (4+ backticks).
 *
 * Extended fences allow embedding triple-backtick blocks in expected output.
 * A closing fence must have at least as many backticks as the opening fence
 * (per CommonMark spec).
 */
function findConsoleCodeBlocks(text: string): CodeBlockMatch[] {
  const results: CodeBlockMatch[] = [];
  const lines = text.split('\n');

  const offsets: number[] = new Array<number>(lines.length);
  offsets[0] = 0;
  for (let j = 1; j < lines.length; j++) {
    offsets[j] = offsets[j - 1]! + lines[j - 1]!.length + 1;
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    const openMatch = /^(`{3,})(console|bash)\s*$/.exec(trimmed);

    if (!openMatch) {
      i++;
      continue;
    }

    const fenceLen = openMatch[1]!.length;
    const infoString = openMatch[2]!;
    const openLineIdx = i;
    const closingRe = new RegExp(`^\`{${fenceLen},}\\s*$`);

    i++;
    while (i < lines.length) {
      const cur = lines[i]!;
      const curTrimmed = cur.endsWith('\r') ? cur.slice(0, -1) : cur;
      if (closingRe.test(curTrimmed)) {
        const startOffset = offsets[openLineIdx]!;
        const endOffset = offsets[i]! + lines[i]!.length;
        const contentStart = offsets[openLineIdx + 1]!;
        const contentEnd = offsets[i]!;

        results.push({
          fullMatch: text.slice(startOffset, endOffset),
          infoString,
          content: text.slice(contentStart, contentEnd),
          index: startOffset,
          endIndex: endOffset,
          line: openLineIdx + 1,
        });
        i++;
        break;
      }
      i++;
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
export function validateConfig(raw: unknown): ConfigWarning[] {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return [{ path: '', message: 'frontmatter must be a YAML mapping' }];
  }

  const result = FrontmatterSchema.safeParse(raw);
  if (result.success) {
    return [];
  }

  // Every warning comes from the schema, so nested objects and unknown keys are
  // covered by the same rules as top-level ones.
  return result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    if (issue.code === 'unrecognized_keys') {
      const keys = issue.keys.map((key) => `'${key}'`).join(', ');
      return {
        path: path ? `${path}.${issue.keys[0] ?? ''}` : (issue.keys[0] ?? ''),
        message: path
          ? `unknown config key(s) under '${path}': ${keys}`
          : `unknown config key(s): ${keys}`,
      };
    }
    return { path, message: path ? `${path}: ${issue.message}` : issue.message };
  });
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

  // Extract frontmatter if present
  const frontmatterMatch = FRONTMATTER_REGEX.exec(content);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1] ?? '';
    const parsed: unknown = parseYaml(yamlContent);
    configWarnings = validateConfig(parsed);
    config = parsed ?? {};
    body = content.slice(frontmatterMatch[0].length);
    bodyOffset = frontmatterMatch[0].length;
  }

  // Number of lines consumed by the frontmatter, so block line numbers stay
  // relative to the whole file.
  const bodyLineOffset = bodyOffset === 0 ? 0 : content.slice(0, bodyOffset).split('\n').length - 1;

  // Parse all console blocks (supports extended fences with 4+ backticks)
  const blocks: TestBlock[] = [];
  const codeBlocks = findConsoleCodeBlocks(body);

  for (const codeBlock of codeBlocks) {
    const blockStart = codeBlock.index;
    const lineNumber = codeBlock.line + bodyLineOffset;

    // Look for a heading before this block (for test name)
    const contentBefore = body.slice(0, blockStart);
    const lastHeadingMatch = [
      ...contentBefore.matchAll(new RegExp(HEADING_REGEX.source, 'gm')),
    ].pop();
    const name = lastHeadingMatch?.[1]?.trim();

    // Check for skip/only annotations in the heading line or nearby comments
    const headingContext = lastHeadingMatch
      ? contentBefore.slice(contentBefore.lastIndexOf(lastHeadingMatch[0]))
      : '';
    const skip = SKIP_ANNOTATION_REGEX.test(headingContext);
    const only = ONLY_ANNOTATION_REGEX.test(headingContext);

    // Parse the block content
    const parsed = parseBlockContent(codeBlock.content, filePath, lineNumber);
    if (parsed) {
      blocks.push({
        name,
        command: parsed.command,
        expectedOutput: parsed.expectedOutput,
        expectedStderr: parsed.expectedStderr,
        expectedExitCode: parsed.expectedExitCode,
        lineNumber,
        rawContent: codeBlock.fullMatch,
        startOffset: bodyOffset + codeBlock.index,
        endOffset: bodyOffset + codeBlock.endIndex,
        infoString: codeBlock.infoString,
        skip,
        only,
      });
    }
  }

  return { path: filePath, config, configWarnings, blocks, rawContent };
}

/**
 * Parse the content of a single console block.
 *
 * @param content - Block body, without the fences
 * @param filePath - Test file path, for error messages
 * @param blockLine - 1-indexed line of the opening fence, for error messages
 */
function parseBlockContent(
  content: string,
  filePath: string,
  blockLine: number,
): {
  command: string;
  expectedOutput: string;
  expectedStderr?: string;
  expectedExitCode: number;
} | null {
  const lines = content.split('\n');
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
          'a console block may contain only one `$ ` command prompt; ' +
            'put the second command in its own console block',
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
          'a console block may specify `? ` (expected exit code) only once',
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
    return null;
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

  return { command: command.trim(), expectedOutput, expectedStderr, expectedExitCode };
}
