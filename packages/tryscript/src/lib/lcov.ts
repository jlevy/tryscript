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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

/**
 * Parse LCOV content into structured data.
 */
export function parseLcov(content: string): LcovData {
  const files = new Map<string, FileCoverage>();
  let currentFile: FileCoverage | null = null;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (trimmed.startsWith('SF:')) {
      const path = trimmed.slice(3);
      currentFile = {
        path,
        lines: new Map(),
        functions: new Map(),
        branches: [],
      };
      files.set(path, currentFile);
    } else if (trimmed.startsWith('DA:') && currentFile) {
      // DA:linenum,hitcount
      const parts = trimmed.slice(3).split(',');
      const lineNumber = parseInt(parts[0]!, 10);
      const hitCount = parseInt(parts[1]!, 10);
      currentFile.lines.set(lineNumber, { lineNumber, hitCount });
    } else if (trimmed.startsWith('FN:') && currentFile) {
      // FN:linenum,funcname
      const parts = trimmed.slice(3).split(',');
      const lineNumber = parseInt(parts[0]!, 10);
      const name = parts.slice(1).join(','); // Function name might contain commas
      if (!currentFile.functions.has(name)) {
        currentFile.functions.set(name, { name, lineNumber, hitCount: 0 });
      } else {
        currentFile.functions.get(name)!.lineNumber = lineNumber;
      }
    } else if (trimmed.startsWith('FNDA:') && currentFile) {
      // FNDA:hitcount,funcname
      const parts = trimmed.slice(5).split(',');
      const hitCount = parseInt(parts[0]!, 10);
      const name = parts.slice(1).join(',');
      if (currentFile.functions.has(name)) {
        currentFile.functions.get(name)!.hitCount = hitCount;
      } else {
        currentFile.functions.set(name, { name, lineNumber: 0, hitCount });
      }
    } else if (trimmed.startsWith('BRDA:') && currentFile) {
      // BRDA:line,block,branch,taken
      const parts = trimmed.slice(5).split(',');
      currentFile.branches.push({
        line: parseInt(parts[0]!, 10),
        block: parseInt(parts[1]!, 10),
        branch: parseInt(parts[2]!, 10),
        taken: parts[3] === '-' ? -1 : parseInt(parts[3]!, 10),
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
          lines: new Map(file.lines),
          functions: new Map(file.functions),
          branches: [...file.branches],
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

  for (const file of lcov.files.values()) {
    lines.push(`SF:${file.path}`);

    // Functions (FN entries first, then FNDA)
    const sortedFunctions = [...file.functions.values()].sort(
      (a, b) => a.lineNumber - b.lineNumber,
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
    for (const branch of file.branches) {
      const taken = branch.taken < 0 ? '-' : branch.taken.toString();
      lines.push(`BRDA:${branch.line},${branch.block},${branch.branch},${taken}`);
    }

    // Branch summary
    const brf = file.branches.length;
    const brh = file.branches.filter((b) => b.taken > 0).length;
    lines.push(`BRF:${brf}`);
    lines.push(`BRH:${brh}`);

    // Lines (sorted by line number)
    const sortedLines = [...file.lines.values()].sort((a, b) => a.lineNumber - b.lineNumber);
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
  return parseLcov(content);
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
