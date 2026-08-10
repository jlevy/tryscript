import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isC8Available,
  resolveC8Command,
  createCoverageContext,
  getCoverageEnv,
  cleanupCoverageContext,
} from '../src/lib/coverage.js';
import { resolveCoverageConfig, DEFAULT_COVERAGE_CONFIG } from '../src/lib/config.js';

describe('coverage', () => {
  describe('resolveC8Command', () => {
    it('runs the installed JavaScript entry point through the current Node executable', () => {
      const result = resolveC8Command();

      expect(result?.command).toBe(process.execPath);
      expect(result?.argsPrefix).toHaveLength(1);
      expect(result?.argsPrefix[0]?.replaceAll('\\', '/')).toMatch(/\/c8\/bin\/c8\.js$/);
    });

    it('uses an explicit test command without adding arguments', () => {
      const previous = process.env.TRYSCRIPT_C8_COMMAND;
      process.env.TRYSCRIPT_C8_COMMAND = '/tmp/mock-c8';

      try {
        expect(resolveC8Command()).toEqual({ command: '/tmp/mock-c8', argsPrefix: [] });
      } finally {
        if (previous === undefined) {
          delete process.env.TRYSCRIPT_C8_COMMAND;
        } else {
          process.env.TRYSCRIPT_C8_COMMAND = previous;
        }
      }
    });
  });

  describe('resolveCoverageConfig', () => {
    it('returns defaults when no config provided', () => {
      const result = resolveCoverageConfig();
      expect(result).toEqual(DEFAULT_COVERAGE_CONFIG);
    });

    it('merges provided config with defaults', () => {
      const result = resolveCoverageConfig({
        reportsDir: 'custom-coverage',
        reporters: ['text'],
      });
      expect(result.reportsDir).toBe('custom-coverage');
      expect(result.reporters).toEqual(['text']);
      expect(result.include).toEqual(DEFAULT_COVERAGE_CONFIG.include);
      expect(result.src).toBe(DEFAULT_COVERAGE_CONFIG.src);
    });

    it('preserves all custom options', () => {
      const customConfig = {
        reportsDir: 'my-coverage',
        reporters: ['lcov', 'json'],
        include: ['build/**'],
        exclude: ['**/vendor/**'],
        excludeNodeModules: false,
        excludeAfterRemap: true,
        skipFull: true,
        allowExternal: true,
        src: 'source',
        monocart: true,
      };
      const result = resolveCoverageConfig(customConfig);
      expect(result).toEqual(customConfig);
    });
  });

  describe('createCoverageContext', () => {
    let tempDir: string;

    afterEach(async () => {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
      }
    });

    it('creates context with default options', async () => {
      const ctx = await createCoverageContext();
      tempDir = ctx.tempDir;

      expect(ctx.tempDir).toContain('tryscript-coverage-');
      expect(ctx.options).toEqual(DEFAULT_COVERAGE_CONFIG);
    });

    it('creates context with custom options', async () => {
      const ctx = await createCoverageContext({
        reportsDir: 'custom-dir',
        reporters: ['text'],
      });
      tempDir = ctx.tempDir;

      expect(ctx.options.reportsDir).toBe('custom-dir');
      expect(ctx.options.reporters).toEqual(['text']);
    });
  });

  describe('getCoverageEnv', () => {
    it('returns NODE_V8_COVERAGE pointing to temp dir', async () => {
      const ctx = await createCoverageContext();
      try {
        const env = getCoverageEnv(ctx);
        expect(env.NODE_V8_COVERAGE).toBe(ctx.tempDir);
      } finally {
        await cleanupCoverageContext(ctx);
      }
    });
  });

  describe('cleanupCoverageContext', () => {
    it('removes the temp directory', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-cleanup-'));
      const ctx = {
        tempDir,
        options: DEFAULT_COVERAGE_CONFIG,
      };

      await cleanupCoverageContext(ctx);

      // Verify directory is removed by trying to access it
      await expect(rm(tempDir)).rejects.toThrow();
    });

    it('handles non-existent directory gracefully', async () => {
      const ctx = {
        tempDir: '/nonexistent/path/that/does/not/exist',
        options: DEFAULT_COVERAGE_CONFIG,
      };

      // Should not throw
      await expect(cleanupCoverageContext(ctx)).resolves.toBeUndefined();
    });
  });

  describe('isC8Available', () => {
    it('returns true when c8 is available', async () => {
      // c8 is installed as devDependency, so should be available
      const result = await isC8Available();
      expect(result).toBe(true);
    });
  });
});
