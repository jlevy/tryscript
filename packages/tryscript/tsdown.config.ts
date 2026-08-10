import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };
import { getGitVersion } from './build-version.ts';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  dts: true,
  clean: true,
  deps: {
    // CommonJS output must not require ESM-only dependencies on Node 20 releases
    // predating synchronous require(ESM) support.
    alwaysBundle: ['atomically', 'strip-ansi'],
    onlyBundle: false,
  },
  define: {
    __VERSION__: JSON.stringify(getGitVersion(pkg.version)),
  },
  // No shebang banner: tsdown preserves the one already in `src/bin.ts`. Adding it
  // here as well emits it twice, and a second `#!` line is a syntax error that breaks
  // the built CLI outright.
});
