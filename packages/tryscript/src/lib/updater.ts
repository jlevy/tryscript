import { writeFile } from 'atomically';
import type { TestFile, TestBlock, TestBlockResult } from './types.js';

/**
 * Update a test file with actual output from test results.
 */
export async function updateTestFile(
  file: TestFile,
  results: TestBlockResult[],
): Promise<{ updated: boolean; changes: string[] }> {
  let content = file.rawContent;
  const changes: string[] = [];

  // Map by block identity so update works correctly with --filter/<!-- only -->
  // where `results` can be a strict subset of `file.blocks`.
  const resultByBlock = new Map(results.map((result) => [result.block, result]));
  // Process blocks in reverse order to maintain correct offsets
  const blocksWithResults = [...file.blocks]
    .map((block) => ({ block, result: resultByBlock.get(block) }))
    .reverse();

  for (const { block, result } of blocksWithResults) {
    if (!result) {
      continue;
    }

    if (result.passed) {
      continue; // Don't touch passing tests
    }

    if (result.error) {
      // Execution error, can't update
      continue;
    }

    // Build the new block content
    const newBlockContent = buildUpdatedBlock(block, result);

    // Find and replace the block in the file
    const blockStart = content.indexOf(block.rawContent);
    if (blockStart !== -1) {
      content =
        content.slice(0, blockStart) +
        newBlockContent +
        content.slice(blockStart + block.rawContent.length);

      changes.push(block.name ?? `Line ${block.lineNumber}`);
    }
  }

  if (changes.length > 0) {
    await writeFile(file.path, content);
  }

  return { updated: changes.length > 0, changes };
}

/**
 * Build an updated console block with new expected output.
 */
function buildUpdatedBlock(block: TestBlock, result: TestBlockResult): string {
  const fence = '`'.repeat(/^(`+)/.exec(block.rawContent)?.[1]?.length ?? 3);

  // Reconstruct the command line(s)
  const commandLines = block.command.split('\n').map((line, i) => {
    return i === 0 ? `$ ${line}` : `> ${line}`;
  });

  // Build the block
  const lines: string[] = [`${fence}console`, ...commandLines];

  // Add output if present
  const trimmedOutput = result.actualOutput.trimEnd();
  if (trimmedOutput) {
    lines.push(trimmedOutput);
  }

  // Add exit code
  lines.push(`? ${result.actualExitCode}`, fence);

  return lines.join('\n');
}
