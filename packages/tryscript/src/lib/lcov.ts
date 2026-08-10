/**
 * LCOV parsing, merging, and writing utilities.
 *
 * LCOV format reference:
 * - SF: Source file path
 * - DA:linenum,hitcount - Line data
 * - FN:linenum,funcname - Function definition
 * - FNDA:hitcount,funcname - Function hit data
 * - FNF: Functions found count
 * - FNH: Functions hit count
 * - BRF: Branches found count
 * - BRH: Branches hit count
 * - BRDA:line,block,branch,taken - Branch data
 * - LF: Lines found count
 * - LH: Lines hit count
 * - end_of_record - End of file record
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { writeFileSync } from 'atomically';
import { dirname } from 'node:path';

/** Coverage data for a single line */
interface LineData {
  lineNumber: number;
  hitCount: number;
}

/** Coverage data for a function */
interface FunctionData {
  name: string;
  lineNumber: number;
  hitCount: number;
}

/** Coverage data for a branch */
interface BranchData {
  line: number;
  block: number;
  branch: number;
  taken: number; // -1 means not taken, 0+ means taken count
}

/** Coverage data for a single source file */
interface FileCoverage {
  path: string;
  lines: Map<number, LineData>;
  functions: Map<string, FunctionData>;
  branches: BranchData[];
}

/** Parsed LCOV data */
export interface LcovData {
  files: Map<string, FileCoverage>;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidRecord(source: string, lineNumber: number, type: string, detail: string): Error {
  return new Error(`${source}:${lineNumber}: invalid ${type} record: ${detail}`);
}

function parseRecordInteger(
  value: string | undefined,
  source: string,
  lineNumber: number,
  type: string,
  field: string,
  minimum: number,
): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw invalidRecord(source, lineNumber, type, `${field} must be an integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw invalidRecord(
      source,
      lineNumber,
      type,
      `${field} must be a safe integer greater than or equal to ${minimum}`,
    );
  }
  return parsed;
}

function splitRecordValue(
  value: string,
  source: string,
  lineNumber: number,
  type: string,
): [string, string] {
  const separator = value.indexOf(',');
  if (separator === -1 || separator === value.length - 1) {
    throw invalidRecord(source, lineNumber, type, 'expected comma-separated fields');
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

/**
 * Parse LCOV content into structured data.
 */
export function parseLcov(content: string, source = 'LCOV input'): LcovData {
  const files = new Map<string, FileCoverage>();
  let currentFile: FileCoverage | null = null;

  for (const [lineIndex, line] of content.split('\n').entries()) {
    const lineNumber = lineIndex + 1;
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      const path = trimmed.slice(3);
      if (path === '') {
        throw invalidRecord(source, lineNumber, 'SF', 'source path must not be empty');
      }
      currentFile = {
        path,
        lines: new Map(),
        functions: new Map(),
        branches: [],
      };
      files.set(path, currentFile);
    } else if (trimmed.startsWith('DA:')) {
      if (!currentFile) {
        throw invalidRecord(source, lineNumber, 'DA', 'record appears before an SF record');
      }
      // DA:linenum,hitcount
      const parts = trimmed.slice(3).split(',');
      const sourceLine = parseRecordInteger(parts[0], source, lineNumber, 'DA', 'line number', 0);
      const hitCount = parseRecordInteger(parts[1], source, lineNumber, 'DA', 'hit count', 0);
      currentFile.lines.set(sourceLine, { lineNumber: sourceLine, hitCount });
    } else if (trimmed.startsWith('FN:')) {
      if (!currentFile) {
        throw invalidRecord(source, lineNumber, 'FN', 'record appears before an SF record');
      }
      // FN:linenum,funcname
      const [rawSourceLine, name] = splitRecordValue(trimmed.slice(3), source, lineNumber, 'FN');
      const sourceLine = parseRecordInteger(
        rawSourceLine,
        source,
        lineNumber,
        'FN',
        'line number',
        0,
      );
      if (!currentFile.functions.has(name)) {
        currentFile.functions.set(name, { name, lineNumber: sourceLine, hitCount: 0 });
      } else {
        currentFile.functions.get(name)!.lineNumber = sourceLine;
      }
    } else if (trimmed.startsWith('FNDA:')) {
      if (!currentFile) {
        throw invalidRecord(source, lineNumber, 'FNDA', 'record appears before an SF record');
      }
      // FNDA:hitcount,funcname
      const [rawHitCount, name] = splitRecordValue(trimmed.slice(5), source, lineNumber, 'FNDA');
      const hitCount = parseRecordInteger(rawHitCount, source, lineNumber, 'FNDA', 'hit count', 0);
      if (currentFile.functions.has(name)) {
        currentFile.functions.get(name)!.hitCount = hitCount;
      } else {
        currentFile.functions.set(name, { name, lineNumber: 0, hitCount });
      }
    } else if (trimmed.startsWith('BRDA:')) {
      if (!currentFile) {
        throw invalidRecord(source, lineNumber, 'BRDA', 'record appears before an SF record');
      }
      // BRDA:line,block,branch,taken
      const parts = trimmed.slice(5).split(',');
      if (parts.length !== 4) {
        throw invalidRecord(source, lineNumber, 'BRDA', 'expected four comma-separated fields');
      }
      currentFile.branches.push({
        line: parseRecordInteger(parts[0], source, lineNumber, 'BRDA', 'line number', 0),
        block: parseRecordInteger(parts[1], source, lineNumber, 'BRDA', 'block number', 0),
        branch: parseRecordInteger(parts[2], source, lineNumber, 'BRDA', 'branch number', 0),
        taken:
          parts[3] === '-'
            ? -1
            : parseRecordInteger(parts[3], source, lineNumber, 'BRDA', 'taken count', 0),
      });
    } else if (trimmed === 'end_of_record') {
      currentFile = null;
    }
    // Ignore FNF, FNH, BRF, BRH, LF, LH - we'll recalculate these
  }

  return { files };
}

/**
 * Merge multiple LCOV data structures, taking max hit counts.
 */
export function mergeLcov(...lcovs: LcovData[]): LcovData {
  const merged = new Map<string, FileCoverage>();

  for (const lcov of lcovs) {
    for (const [path, file] of lcov.files) {
      if (!merged.has(path)) {
        // Clone the file data
        merged.set(path, {
          path,
          lines: new Map([...file.lines].map(([line, data]) => [line, { ...data }])),
          functions: new Map([...file.functions].map(([name, data]) => [name, { ...data }])),
          branches: file.branches.map((branch) => ({ ...branch })),
        });
      } else {
        const existing = merged.get(path)!;

        // Merge lines - take max hit count
        for (const [lineNum, lineData] of file.lines) {
          const existingLine = existing.lines.get(lineNum);
          if (existingLine) {
            existingLine.hitCount = Math.max(existingLine.hitCount, lineData.hitCount);
          } else {
            existing.lines.set(lineNum, { ...lineData });
          }
        }

        // Merge functions - take max hit count
        for (const [name, funcData] of file.functions) {
          const existingFunc = existing.functions.get(name);
          if (existingFunc) {
            existingFunc.hitCount = Math.max(existingFunc.hitCount, funcData.hitCount);
          } else {
            existing.functions.set(name, { ...funcData });
          }
        }

        // Merge branches - match by line/block/branch, take max
        for (const branch of file.branches) {
          const existingBranch = existing.branches.find(
            (b) => b.line === branch.line && b.block === branch.block && b.branch === branch.branch,
          );
          if (existingBranch) {
            if (branch.taken >= 0) {
              existingBranch.taken =
                existingBranch.taken >= 0
                  ? Math.max(existingBranch.taken, branch.taken)
                  : branch.taken;
            }
          } else {
            existing.branches.push({ ...branch });
          }
        }
      }
    }
  }

  return { files: merged };
}

/**
 * Convert LCOV data back to LCOV format string.
 */
export function formatLcov(lcov: LcovData): string {
  const lines: string[] = [];

  const sortedFiles = [...lcov.files.values()].sort((a, b) => compareStrings(a.path, b.path));
  for (const file of sortedFiles) {
    lines.push(`SF:${file.path}`);

    // Functions (FN entries first, then FNDA)
    const sortedFunctions = [...file.functions.values()].sort(
      (a, b) =>
        compareNumbers(a.lineNumber, b.lineNumber) ||
        compareStrings(a.name, b.name) ||
        compareNumbers(a.hitCount, b.hitCount),
    );
    for (const func of sortedFunctions) {
      lines.push(`FN:${func.lineNumber},${func.name}`);
    }
    for (const func of sortedFunctions) {
      lines.push(`FNDA:${func.hitCount},${func.name}`);
    }

    // Function summary
    const fnf = file.functions.size;
    const fnh = [...file.functions.values()].filter((f) => f.hitCount > 0).length;
    lines.push(`FNF:${fnf}`);
    lines.push(`FNH:${fnh}`);

    // Branches
    const sortedBranches = [...file.branches].sort(
      (a, b) =>
        compareNumbers(a.line, b.line) ||
        compareNumbers(a.block, b.block) ||
        compareNumbers(a.branch, b.branch) ||
        compareNumbers(a.taken, b.taken),
    );
    for (const branch of sortedBranches) {
      const taken = branch.taken < 0 ? '-' : branch.taken.toString();
      lines.push(`BRDA:${branch.line},${branch.block},${branch.branch},${taken}`);
    }

    // Branch summary
    const brf = file.branches.length;
    const brh = file.branches.filter((b) => b.taken > 0).length;
    lines.push(`BRF:${brf}`);
    lines.push(`BRH:${brh}`);

    // Lines (sorted by line number)
    const sortedLines = [...file.lines.values()].sort(
      (a, b) =>
        compareNumbers(a.lineNumber, b.lineNumber) || compareNumbers(a.hitCount, b.hitCount),
    );
    for (const line of sortedLines) {
      lines.push(`DA:${line.lineNumber},${line.hitCount}`);
    }

    // Line summary
    const lf = file.lines.size;
    const lh = [...file.lines.values()].filter((l) => l.hitCount > 0).length;
    lines.push(`LF:${lf}`);
    lines.push(`LH:${lh}`);

    lines.push('end_of_record');
  }

  return lines.join('\n') + '\n';
}

/** Coverage summary metrics */
interface CoverageMetrics {
  total: number;
  covered: number;
  skipped: number;
  pct: number;
}

/** Coverage summary for a file or total */
interface FileSummary {
  lines: CoverageMetrics;
  statements: CoverageMetrics;
  functions: CoverageMetrics;
  branches: CoverageMetrics;
  branchesTrue?: CoverageMetrics;
}

/** JSON summary format (compatible with istanbul/vitest) */
export interface CoverageSummary {
  total: FileSummary;
  [filePath: string]: FileSummary;
}

/**
 * Convert LCOV data to JSON summary format (compatible with istanbul/vitest).
 */
export function lcovToJsonSummary(lcov: LcovData): CoverageSummary {
  const withPct = (total: number, covered: number): CoverageMetrics => ({
    total,
    covered,
    skipped: 0,
    pct: total > 0 ? parseFloat(((covered / total) * 100).toFixed(2)) : 100,
  });

  const totals = {
    lines: { total: 0, covered: 0 },
    functions: { total: 0, covered: 0 },
    branches: { total: 0, covered: 0 },
  };

  const summary: CoverageSummary = {
    total: {
      lines: withPct(0, 0),
      statements: withPct(0, 0),
      functions: withPct(0, 0),
      branches: withPct(0, 0),
      branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 100 },
    },
  };

  for (const file of lcov.files.values()) {
    const linesTotal = file.lines.size;
    const linesCovered = [...file.lines.values()].filter((l) => l.hitCount > 0).length;
    const funcsTotal = file.functions.size;
    const funcsCovered = [...file.functions.values()].filter((f) => f.hitCount > 0).length;
    const branchesTotal = file.branches.length;
    const branchesCovered = file.branches.filter((b) => b.taken > 0).length;

    summary[file.path] = {
      lines: withPct(linesTotal, linesCovered),
      statements: withPct(linesTotal, linesCovered), // statements ≈ lines for LCOV
      functions: withPct(funcsTotal, funcsCovered),
      branches: withPct(branchesTotal, branchesCovered),
    };

    totals.lines.total += linesTotal;
    totals.lines.covered += linesCovered;
    totals.functions.total += funcsTotal;
    totals.functions.covered += funcsCovered;
    totals.branches.total += branchesTotal;
    totals.branches.covered += branchesCovered;
  }

  summary.total = {
    lines: withPct(totals.lines.total, totals.lines.covered),
    statements: withPct(totals.lines.total, totals.lines.covered),
    functions: withPct(totals.functions.total, totals.functions.covered),
    branches: withPct(totals.branches.total, totals.branches.covered),
    branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 100 },
  };

  return summary;
}

/**
 * Read and parse an LCOV file.
 */
export function readLcovFile(path: string): LcovData {
  const content = readFileSync(path, 'utf8');
  return parseLcov(content, path);
}

/**
 * Write LCOV data to a file.
 */
export function writeLcovFile(path: string, lcov: LcovData): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatLcov(lcov));
}

/**
 * Write JSON summary to a file.
 */
export function writeJsonSummary(path: string, summary: CoverageSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(summary, null, 2));
}
