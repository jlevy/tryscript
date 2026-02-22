import { parse as parseYaml } from 'yaml';
import type { TestConfig, TestBlock, TestFile } from './types.js';

/** Regex to match YAML frontmatter at the start of a file */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** Regex to match markdown headings (for test names) */
const HEADING_REGEX = /^#+\s+(?:Test:\s*)?(.+)$/m;

/** Regex to match skip annotation in heading or nearby HTML comment */
const SKIP_ANNOTATION_REGEX = /<!--\s*skip\s*-->/i;

/** Regex to match only annotation in heading or nearby HTML comment */
const ONLY_ANNOTATION_REGEX = /<!--\s*only\s*-->/i;

interface CodeBlockMatch {
  fullMatch: string;
  infoString: string;
  content: string;
  index: number;
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
 * Parse a .tryscript.md file into structured test data.
 */
export function parseTestFile(content: string, filePath: string): TestFile {
  const rawContent = content;
  let config: TestConfig = {};
  let body = content;

  // Extract frontmatter if present
  const frontmatterMatch = FRONTMATTER_REGEX.exec(content);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1] ?? '';
    config = parseYaml(yamlContent) as TestConfig;
    body = content.slice(frontmatterMatch[0].length);
  }

  // Parse all console blocks (supports extended fences with 4+ backticks)
  const blocks: TestBlock[] = [];
  const codeBlocks = findConsoleCodeBlocks(body);

  for (const codeBlock of codeBlocks) {
    const blockContent = codeBlock.content;
    const blockStart = codeBlock.index;

    // Find the line number (1-indexed)
    const precedingContent = content.slice(0, content.indexOf(codeBlock.fullMatch));
    const lineNumber = precedingContent.split('\n').length;

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
    const parsed = parseBlockContent(blockContent);
    if (parsed) {
      blocks.push({
        name,
        command: parsed.command,
        expectedOutput: parsed.expectedOutput,
        expectedStderr: parsed.expectedStderr,
        expectedExitCode: parsed.expectedExitCode,
        lineNumber,
        rawContent: codeBlock.fullMatch,
        skip,
        only,
      });
    }
  }

  return { path: filePath, config, blocks, rawContent };
}

/**
 * Parse the content of a single console block.
 */
function parseBlockContent(content: string): {
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

  for (const line of lines) {
    if (line.startsWith('$ ')) {
      // Start of a command
      inCommand = true;
      commandLines.push(line.slice(2));
    } else if (line.startsWith('> ') && inCommand) {
      // Continuation of a multi-line command
      commandLines.push(line.slice(2));
    } else if (line.startsWith('? ')) {
      // Exit code specification
      inCommand = false;
      expectedExitCode = parseInt(line.slice(2).trim(), 10);
    } else if (line.startsWith('! ')) {
      // Stderr line (prefixed with !)
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
