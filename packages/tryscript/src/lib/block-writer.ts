import type { TestBlock } from './types.js';

/** Pieces of a console block to serialize back into a test file. */
export interface BlockParts {
  /** Expected stdout (or combined output when stderr is not asserted separately) */
  output: string;
  /**
   * Expected stderr, emitted as `!`-prefixed lines.
   *
   * Only set when the block asserts stdout and stderr separately; `undefined` means
   * the block asserts combined output and no `!` lines are written.
   */
  stderr?: string;
  exitCode: number;
}

/** The opening fence of a block, preserving its original backtick count. */
export function fenceOf(block: TestBlock): string {
  return '`'.repeat(/^(`+)/.exec(block.rawContent)?.[1]?.length ?? 3);
}

/**
 * Serialize a console block back into test file source.
 *
 * Preserves the block's fence width and info string, so a ```bash block does not
 * silently become a ```console one, and re-emits `!` stderr lines so a block that
 * asserted stdout and stderr separately keeps doing so after a rewrite.
 */
export function buildBlock(block: TestBlock, parts: BlockParts): string {
  const fence = fenceOf(block);
  const lineEnding = block.rawContent.includes('\r\n') ? '\r\n' : '\n';

  const commandLines = block.command
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line, i) => (i === 0 ? `$ ${line}` : `> ${line}`));

  const lines: string[] = [`${fence}${block.infoString ?? 'console'}`, ...commandLines];

  const trimmedOutput = parts.output.replace(/\r\n?/gu, '\n').trimEnd();
  if (trimmedOutput) {
    lines.push(...trimmedOutput.split('\n'));
  }

  if (parts.stderr !== undefined) {
    const trimmedStderr = parts.stderr.replace(/\r\n?/gu, '\n').trimEnd();
    // A blank stderr line is written as a bare `!`; `! ` would depend on trailing
    // whitespace that editors and formatters strip. An empty string is intentional:
    // it preserves an explicit assertion that stderr must be empty.
    lines.push(...trimmedStderr.split('\n').map((line) => (line ? `! ${line}` : '!')));
  }

  lines.push(`? ${parts.exitCode}`, fence);

  return lines.join(lineEnding);
}

/**
 * Splice rewritten blocks into file content by source offset.
 *
 * Rewrites are applied in descending offset order so earlier offsets stay valid.
 * Locating blocks by offset rather than by searching for their text is what makes
 * repeated, byte-identical parsed blocks update in place instead of swapping outputs.
 * Legacy programmatic blocks may omit offsets; those use ordered content lookup and
 * fail explicitly if their source is stale.
 */
export function spliceBlocks(
  content: string,
  edits: { block: TestBlock; replacement: string }[],
): string {
  let result = content;
  let fallbackSearchOffset = 0;
  const resolved = edits.flatMap(({ block, replacement }) => {
    const hasStartOffset = block.startOffset !== undefined;
    const hasEndOffset = block.endOffset !== undefined;
    if (hasStartOffset !== hasEndOffset) {
      throw new Error(
        `Cannot rewrite the test block from line ${block.lineNumber}; ` +
          'its source-offset metadata is incomplete.',
      );
    }

    if (block.startOffset !== undefined && block.endOffset !== undefined) {
      const offsetsAreValid =
        Number.isInteger(block.startOffset) &&
        Number.isInteger(block.endOffset) &&
        block.startOffset >= 0 &&
        block.startOffset <= block.endOffset &&
        block.endOffset <= content.length;
      const sourceMatches =
        offsetsAreValid && content.slice(block.startOffset, block.endOffset) === block.rawContent;
      if (!sourceMatches) {
        throw new Error(
          `Cannot rewrite the test block from line ${block.lineNumber}; ` +
            'its source offsets are invalid or stale for the target file.',
        );
      }
      return [{ startOffset: block.startOffset, endOffset: block.endOffset, replacement }];
    }

    let startOffset = content.indexOf(block.rawContent, fallbackSearchOffset);
    if (startOffset === -1) {
      startOffset = content.indexOf(block.rawContent);
    }
    if (startOffset === -1) {
      throw new Error(
        `Cannot locate the test block from line ${block.lineNumber}; ` +
          'the parsed file content is stale or does not match the target file.',
      );
    }

    const endOffset = startOffset + block.rawContent.length;
    fallbackSearchOffset = endOffset;
    return [{ startOffset, endOffset, replacement }];
  });
  const ordered = resolved.sort(
    (a, b) => b.startOffset - a.startOffset || b.endOffset - a.endOffset,
  );

  for (const { startOffset, endOffset, replacement } of ordered) {
    result = result.slice(0, startOffset) + replacement + result.slice(endOffset);
  }

  return result;
}
