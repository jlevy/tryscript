import { defineConfig } from '../src/index.js';
import type { CoverageContext, TestBlock, TryscriptConfig } from '../src/index.js';

/** Public values accepted by v0.1.7 must remain valid release inputs. */
export const legacyCoverageContext: CoverageContext = {
  tempDir: '/tmp/tryscript-coverage',
  options: {
    reportsDir: undefined,
    reporters: undefined,
    include: undefined,
    exclude: undefined,
    excludeNodeModules: undefined,
    excludeAfterRemap: undefined,
    skipFull: undefined,
    allowExternal: undefined,
    src: undefined,
    monocart: undefined,
  },
};

export const legacyTestBlock: TestBlock = {
  command: 'node --version',
  expectedOutput: 'v20.0.0',
  expectedExitCode: 0,
  lineNumber: 1,
  rawContent: '$ node --version\nv20.0.0',
};

export const legacyConfig: TryscriptConfig = defineConfig({
  fixtures: [{ source: 'fixture.txt' }],
});
