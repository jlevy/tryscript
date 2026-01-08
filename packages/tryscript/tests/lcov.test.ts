import { describe, it, expect } from 'vitest';
import { parseLcov, mergeLcov, formatLcov, lcovToJsonSummary } from '../src/lib/lcov.js';

describe('LCOV utilities', () => {
  describe('parseLcov', () => {
    it('parses basic LCOV format', () => {
      const lcov = `SF:/path/to/file.ts
FN:1,myFunction
FNDA:5,myFunction
FNF:1
FNH:1
DA:1,5
DA:2,3
DA:3,0
LF:3
LH:2
end_of_record
`;
      const result = parseLcov(lcov);

      expect(result.files.size).toBe(1);
      const file = result.files.get('/path/to/file.ts');
      expect(file).toBeDefined();
      expect(file!.lines.size).toBe(3);
      expect(file!.lines.get(1)?.hitCount).toBe(5);
      expect(file!.lines.get(2)?.hitCount).toBe(3);
      expect(file!.lines.get(3)?.hitCount).toBe(0);
      expect(file!.functions.size).toBe(1);
      expect(file!.functions.get('myFunction')?.hitCount).toBe(5);
    });

    it('parses branch coverage', () => {
      const lcov = `SF:/path/to/file.ts
BRDA:10,0,0,5
BRDA:10,0,1,-
BRF:2
BRH:1
end_of_record
`;
      const result = parseLcov(lcov);
      const file = result.files.get('/path/to/file.ts');
      expect(file!.branches.length).toBe(2);
      expect(file!.branches[0]).toEqual({ line: 10, block: 0, branch: 0, taken: 5 });
      expect(file!.branches[1]).toEqual({ line: 10, block: 0, branch: 1, taken: -1 });
    });

    it('handles multiple files', () => {
      const lcov = `SF:/path/to/a.ts
DA:1,1
end_of_record
SF:/path/to/b.ts
DA:1,2
end_of_record
`;
      const result = parseLcov(lcov);
      expect(result.files.size).toBe(2);
      expect(result.files.get('/path/to/a.ts')?.lines.get(1)?.hitCount).toBe(1);
      expect(result.files.get('/path/to/b.ts')?.lines.get(1)?.hitCount).toBe(2);
    });

    it('handles function names with commas', () => {
      const lcov = `SF:/path/to/file.ts
FN:1,myFunction<T, U>
FNDA:3,myFunction<T, U>
end_of_record
`;
      const result = parseLcov(lcov);
      const file = result.files.get('/path/to/file.ts');
      expect(file!.functions.get('myFunction<T, U>')?.hitCount).toBe(3);
    });
  });

  describe('mergeLcov', () => {
    it('merges coverage from two sources, taking max hit count', () => {
      const lcov1 = parseLcov(`SF:/path/to/file.ts
DA:1,5
DA:2,0
DA:3,10
end_of_record
`);
      const lcov2 = parseLcov(`SF:/path/to/file.ts
DA:1,3
DA:2,7
DA:3,0
end_of_record
`);

      const merged = mergeLcov(lcov1, lcov2);
      const file = merged.files.get('/path/to/file.ts');

      // Should take max of each line
      expect(file!.lines.get(1)?.hitCount).toBe(5); // max(5, 3)
      expect(file!.lines.get(2)?.hitCount).toBe(7); // max(0, 7)
      expect(file!.lines.get(3)?.hitCount).toBe(10); // max(10, 0)
    });

    it('merges files from different sources', () => {
      const lcov1 = parseLcov(`SF:/path/to/a.ts
DA:1,5
end_of_record
`);
      const lcov2 = parseLcov(`SF:/path/to/b.ts
DA:1,3
end_of_record
`);

      const merged = mergeLcov(lcov1, lcov2);
      expect(merged.files.size).toBe(2);
      expect(merged.files.get('/path/to/a.ts')?.lines.get(1)?.hitCount).toBe(5);
      expect(merged.files.get('/path/to/b.ts')?.lines.get(1)?.hitCount).toBe(3);
    });

    it('merges function coverage taking max hit count', () => {
      const lcov1 = parseLcov(`SF:/path/to/file.ts
FN:1,myFunc
FNDA:5,myFunc
end_of_record
`);
      const lcov2 = parseLcov(`SF:/path/to/file.ts
FN:1,myFunc
FNDA:10,myFunc
end_of_record
`);

      const merged = mergeLcov(lcov1, lcov2);
      const file = merged.files.get('/path/to/file.ts');
      expect(file!.functions.get('myFunc')?.hitCount).toBe(10);
    });

    it('merges branch coverage taking max hit count', () => {
      const lcov1 = parseLcov(`SF:/path/to/file.ts
BRDA:10,0,0,5
BRDA:10,0,1,-
end_of_record
`);
      const lcov2 = parseLcov(`SF:/path/to/file.ts
BRDA:10,0,0,3
BRDA:10,0,1,2
end_of_record
`);

      const merged = mergeLcov(lcov1, lcov2);
      const file = merged.files.get('/path/to/file.ts');
      expect(file!.branches[0]?.taken).toBe(5); // max(5, 3)
      expect(file!.branches[1]?.taken).toBe(2); // -1 was not taken, now it's 2
    });
  });

  describe('formatLcov', () => {
    it('round-trips LCOV data', () => {
      const original = `SF:/path/to/file.ts
FN:1,myFunction
FNDA:5,myFunction
FNF:1
FNH:1
BRDA:10,0,0,5
BRDA:10,0,1,-
BRF:2
BRH:1
DA:1,5
DA:2,3
LF:2
LH:2
end_of_record
`;
      const parsed = parseLcov(original);
      const formatted = formatLcov(parsed);
      const reparsed = parseLcov(formatted);

      // Should have same data after round-trip
      expect(reparsed.files.size).toBe(parsed.files.size);
      const file = reparsed.files.get('/path/to/file.ts');
      expect(file!.lines.get(1)?.hitCount).toBe(5);
      expect(file!.lines.get(2)?.hitCount).toBe(3);
      expect(file!.functions.get('myFunction')?.hitCount).toBe(5);
      expect(file!.branches[0]?.taken).toBe(5);
      expect(file!.branches[1]?.taken).toBe(-1);
    });
  });

  describe('lcovToJsonSummary', () => {
    it('generates correct coverage percentages', () => {
      const lcov = parseLcov(`SF:/path/to/file.ts
FN:1,func1
FN:5,func2
FNDA:5,func1
FNDA:0,func2
DA:1,5
DA:2,3
DA:3,0
DA:4,0
BRDA:10,0,0,5
BRDA:10,0,1,0
end_of_record
`);

      const summary = lcovToJsonSummary(lcov);

      // 2/4 lines covered = 50%
      expect(summary.total.lines.total).toBe(4);
      expect(summary.total.lines.covered).toBe(2);
      expect(summary.total.lines.pct).toBe(50);

      // 1/2 functions covered = 50%
      expect(summary.total.functions.total).toBe(2);
      expect(summary.total.functions.covered).toBe(1);
      expect(summary.total.functions.pct).toBe(50);

      // 1/2 branches covered = 50%
      expect(summary.total.branches.total).toBe(2);
      expect(summary.total.branches.covered).toBe(1);
      expect(summary.total.branches.pct).toBe(50);
    });

    it('handles empty coverage (0 lines) as 100%', () => {
      const lcov = parseLcov(`SF:/path/to/empty.ts
end_of_record
`);

      const summary = lcovToJsonSummary(lcov);
      expect(summary.total.lines.pct).toBe(100);
    });

    it('includes per-file summaries', () => {
      const lcov = parseLcov(`SF:/path/to/a.ts
DA:1,1
DA:2,0
end_of_record
SF:/path/to/b.ts
DA:1,1
end_of_record
`);

      const summary = lcovToJsonSummary(lcov);

      // File a: 1/2 = 50%
      expect(summary['/path/to/a.ts']?.lines.pct).toBe(50);

      // File b: 1/1 = 100%
      expect(summary['/path/to/b.ts']?.lines.pct).toBe(100);

      // Total: 2/3 = 66.67%
      expect(summary.total.lines.total).toBe(3);
      expect(summary.total.lines.covered).toBe(2);
      expect(summary.total.lines.pct).toBe(66.67);
    });
  });
});
