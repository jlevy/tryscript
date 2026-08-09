import { writeFile } from 'atomically';
import { asParsedBlock, buildBlock, spliceBlocks } from './block-writer.js';
import type { ParsedTestBlock, TestFile, TestBlockResult } from './types.js';

/**
 * Update a test file with actual output from test results.
 */
export async function updateTestFile(
  file: TestFile,
  results: TestBlockResult[],
): Promise<{ updated: boolean; changes: string[] }> {
  const changes: string[] = [];
  const edits: { block: ParsedTestBlock; replacement: string }[] = [];

  // Map by block identity so update works correctly with --filter/<!-- only -->
  // where `results` can be a strict subset of `file.blocks`.
  const resultByBlock = new Map(results.map((result) => [result.block, result]));

  for (const block of file.blocks) {
    const result = resultByBlock.get(block);
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

    // A block that asserts stderr separately keeps doing so: rewrite its stdout and
    // stderr from the separately captured streams, not from combined output.
    const separateStderr = block.expectedStderr !== undefined;

    edits.push({
      block: asParsedBlock(block),
      replacement: buildBlock(asParsedBlock(block), {
        output: separateStderr ? (result.actualStdout ?? '') : result.actualOutput,
        stderr: separateStderr ? (result.actualStderr ?? '') : undefined,
        exitCode: result.actualExitCode,
      }),
    });

    changes.push(block.name ?? `Line ${block.lineNumber}`);
  }

  if (edits.length === 0) {
    return { updated: false, changes: [] };
  }

  const content = spliceBlocks(file.rawContent, edits);
  await writeFile(file.path, content);

  return { updated: true, changes };
}
