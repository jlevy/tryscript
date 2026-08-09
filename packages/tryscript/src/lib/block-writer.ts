import type { ParsedTestBlock, TestBlock } from './types.js';

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

/**
 * Narrow a block to one carrying the source bookkeeping a rewrite needs.
 *
 * `parseTestFile` always populates these, so this only fires for a hand-built block
 * passed straight to a rewrite -- in which case failing loudly beats falling back to
 * searching by text, which is the ambiguity that made rewrites target the wrong
 * duplicate block in the first place.
 */
export function asParsedBlock(block: TestBlock): ParsedTestBlock {
  if (
    typeof block.startOffset !== 'number' ||
    typeof block.endOffset !== 'number' ||
    typeof block.infoString !== 'string'
  ) {
    const where = block.name ?? `line ${block.lineNumber}`;
    throw new Error(
      `Cannot rewrite block (${where}): it is missing source offsets. ` +
        'Blocks passed to --update/--expand must come from parseTestFile().',
    );
  }
  return block as ParsedTestBlock;
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
export function buildBlock(block: ParsedTestBlock, parts: BlockParts): string {
  const fence = fenceOf(block);

  const commandLines = block.command.split('\n').map((line, i) => {
    return i === 0 ? `$ ${line}` : `> ${line}`;
  });

  const lines: string[] = [`${fence}${block.infoString}`, ...commandLines];

  const trimmedOutput = parts.output.trimEnd();
  if (trimmedOutput) {
    lines.push(trimmedOutput);
  }

  if (parts.stderr !== undefined) {
    const trimmedStderr = parts.stderr.trimEnd();
    if (trimmedStderr) {
      // A blank stderr line is written as a bare `!`; `! ` would depend on trailing
      // whitespace that editors and formatters strip.
      lines.push(...trimmedStderr.split('\n').map((line) => (line ? `! ${line}` : '!')));
    }
  }

  lines.push(`? ${parts.exitCode}`, fence);

  return lines.join('\n');
}

/**
 * Splice rewritten blocks into file content by source offset.
 *
 * Rewrites are applied in descending offset order so earlier offsets stay valid.
 * Locating blocks by offset rather than by searching for their text is what makes
 * repeated, byte-identical blocks update in place instead of swapping outputs.
 */
export function spliceBlocks(
  content: string,
  edits: { block: ParsedTestBlock; replacement: string }[],
): string {
  let result = content;
  const ordered = [...edits].sort((a, b) => b.block.startOffset - a.block.startOffset);

  for (const { block, replacement } of ordered) {
    result = result.slice(0, block.startOffset) + replacement + result.slice(block.endOffset);
  }

  return result;
}
