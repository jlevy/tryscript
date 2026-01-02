import { parse as parseYaml } from 'yaml';
import type { TestConfig, TestBlock, TestFile } from './types.js';

/** Regex to match YAML frontmatter at the start of a file */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** Regex to match fenced code blocks with console/bash info string */
const CODE_BLOCK_REGEX = /```(console|bash)\r?\n([\s\S]*?)```/g;

/** Regex to match markdown headings (for test names) */
const HEADING_REGEX = /^#+\s+(?:Test:\s*)?(.+)$/m;

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

  // Parse all console blocks
  const blocks: TestBlock[] = [];

  // Reset regex lastIndex
  CODE_BLOCK_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CODE_BLOCK_REGEX.exec(body)) !== null) {
    const blockContent = match[2] ?? '';
    const blockStart = match.index;

    // Find the line number (1-indexed)
    const precedingContent = content.slice(0, content.indexOf(match[0]));
    const lineNumber = precedingContent.split('\n').length;

    // Look for a heading before this block (for test name)
    const contentBefore = body.slice(0, blockStart);
    const lastHeadingMatch = [
      ...contentBefore.matchAll(new RegExp(HEADING_REGEX.source, 'gm')),
    ].pop();
    const name = lastHeadingMatch?.[1]?.trim();

    // Parse the block content
    const parsed = parseBlockContent(blockContent);
    if (parsed) {
      blocks.push({
        name,
        command: parsed.command,
        expectedOutput: parsed.expectedOutput,
        expectedExitCode: parsed.expectedExitCode,
        lineNumber,
        rawContent: match[0],
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
  expectedExitCode: number;
} | null {
  const lines = content.split('\n');
  const commandLines: string[] = [];
  const outputLines: string[] = [];
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
    } else {
      // Output line
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

  return { command: command.trim(), expectedOutput, expectedExitCode };
}
