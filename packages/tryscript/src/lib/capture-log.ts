import { writeFile } from 'atomically';
import { stringifyYaml, manualKeyOrder } from './yaml-utils.js';
import { matchAndCapture } from './matcher.js';
import type { TestFile, TestFileResult } from './types.js';

// Field orderings for each level of the capture log YAML.
// Keys appear in this order; unlisted keys sort alphabetically at the end.

const TOP_LEVEL_ORDER = manualKeyOrder(['generated', 'files']);

const FILE_ORDER = manualKeyOrder(['path', 'blocks']);

const BLOCK_ORDER = manualKeyOrder([
  'name',
  'command',
  'expected_exit_code',
  'actual_exit_code',
  'expected_output',
  'actual_output',
  'expected_stderr',
  'actual_stderr',
  'captures',
  'passed',
]);

const CAPTURE_ORDER = manualKeyOrder(['category', 'name', 'stream', 'multiline', 'matched']);

/**
 * Sort comparator for `yaml.stringify`'s `sortMapEntries`.
 *
 * Dispatches to the correct field ordering based on which keys are present,
 * since the `yaml` package calls this for every map node in the document.
 */
const BLOCK_KEYS = new Set([
  'name',
  'command',
  'expected_exit_code',
  'actual_exit_code',
  'expected_output',
  'actual_output',
  'expected_stderr',
  'actual_stderr',
  'captures',
  'passed',
]);

const CAPTURE_KEYS = new Set(['category', 'name', 'stream', 'multiline', 'matched']);

export function captureLogSortMapEntries(
  a: { key: { value: string } },
  b: { key: { value: string } },
): number {
  const aKey = a.key.value;
  const bKey = b.key.value;

  if (aKey === 'generated' || aKey === 'files' || bKey === 'generated' || bKey === 'files') {
    return TOP_LEVEL_ORDER(a, b);
  }
  if (aKey === 'blocks' || bKey === 'blocks') {
    return FILE_ORDER(a, b);
  }
  if (BLOCK_KEYS.has(aKey) && BLOCK_KEYS.has(bKey)) {
    return BLOCK_ORDER(a, b);
  }
  if (CAPTURE_KEYS.has(aKey) && CAPTURE_KEYS.has(bKey)) {
    return CAPTURE_ORDER(a, b);
  }

  return aKey.localeCompare(bKey);
}

interface CaptureLogBlock {
  name: string | undefined;
  command: string;
  expected_exit_code: number;
  actual_exit_code: number;
  expected_output: string;
  actual_output: string;
  expected_stderr?: string;
  actual_stderr?: string;
  captures: {
    category: string;
    name?: string;
    stream?: 'stdout' | 'stderr';
    multiline: boolean;
    matched: string;
  }[];
  passed: boolean;
}

interface CaptureLogFile {
  path: string;
  blocks: CaptureLogBlock[];
}

interface CaptureLogDoc {
  generated: string;
  files: CaptureLogFile[];
}

/**
 * Build the capture log document structure from test results.
 *
 * `customPatterns` can be a static object or a per-file callback.
 * Separated from `writeCaptureLog` for testability.
 */
export function buildCaptureLogDoc(
  fileResults: TestFileResult[],
  matchContext: (file: TestFile) => { root: string; cwd: string },
  customPatterns?:
    Record<string, string | RegExp> | ((file: TestFile) => Record<string, string | RegExp>),
): CaptureLogDoc {
  const files = fileResults.map((fr) => {
    const ctx = matchContext(fr.file);
    const patterns =
      typeof customPatterns === 'function' ? customPatterns(fr.file) : customPatterns;
    const blocks = fr.results.map((r) => {
      const separateStderr = r.block.expectedStderr !== undefined;
      const actualOutput = separateStderr ? (r.actualStdout ?? '') : r.actualOutput;
      const outputCaptures =
        matchAndCapture(actualOutput, r.block.expectedOutput, ctx, patterns)?.captures ?? [];
      const stderrCaptures = separateStderr
        ? (matchAndCapture(r.actualStderr ?? '', r.block.expectedStderr ?? '', ctx, patterns)
            ?.captures ?? [])
        : [];
      const captures = [
        ...outputCaptures.map((capture) => ({
          category: capture.category,
          ...(capture.name ? { name: capture.name } : {}),
          ...(separateStderr ? { stream: 'stdout' as const } : {}),
          multiline: capture.multiline,
          matched: capture.captured,
        })),
        ...stderrCaptures.map((capture) => ({
          category: capture.category,
          ...(capture.name ? { name: capture.name } : {}),
          stream: 'stderr' as const,
          multiline: capture.multiline,
          matched: capture.captured,
        })),
      ];
      return {
        name: r.block.name,
        command: r.block.command,
        expected_exit_code: r.block.expectedExitCode,
        actual_exit_code: r.actualExitCode,
        expected_output: r.block.expectedOutput,
        actual_output: actualOutput,
        ...(r.block.expectedStderr === undefined
          ? {}
          : {
              expected_stderr: r.block.expectedStderr,
              actual_stderr: r.actualStderr ?? '',
            }),
        captures,
        passed: r.passed,
      };
    });
    return { path: fr.file.path, blocks };
  });

  return {
    generated: new Date().toISOString(),
    files,
  };
}

/**
 * Write a YAML capture log file recording wildcard captures and execution metadata.
 */
export async function writeCaptureLog(
  path: string,
  fileResults: TestFileResult[],
  matchContext: (file: TestFile) => { root: string; cwd: string },
  customPatterns?:
    Record<string, string | RegExp> | ((file: TestFile) => Record<string, string | RegExp>),
): Promise<void> {
  const doc = buildCaptureLogDoc(fileResults, matchContext, customPatterns);
  const header = '# tryscript capture log\n';
  const yaml = stringifyYaml(doc, { sortMapEntries: captureLogSortMapEntries });
  await writeFile(path, header + yaml);
}
