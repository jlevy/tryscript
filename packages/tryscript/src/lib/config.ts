import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestConfig, CoverageConfig, ResolvedCoverageConfig } from './types.js';

export interface TryscriptConfig {
  /** Working directory for commands (default: test file directory) */
  cwd?: string;
  /** Run in isolated sandbox: true = empty temp, path = copy to temp */
  sandbox?: boolean | string;
  /** Fixtures to copy to sandbox directory before tests */
  fixtures?: TestConfig['fixtures'];
  /** Script to run before first test block */
  before?: string;
  /** Script to run after all test blocks */
  after?: string;
  env?: Record<string, string>;
  timeout?: number;
  patterns?: Record<string, RegExp | string>;
  tests?: string[];
  /** Coverage configuration (used with --coverage flag) */
  coverage?: CoverageConfig;
  /**
   * Directories to prepend to PATH (relative entries resolve from the test file).
   * Makes executables in these directories available by name in commands.
   * Supports env var expansion: $VAR or ${VAR} syntax.
   */
  path?: string[];
}

/** Default coverage configuration values. */
export const DEFAULT_COVERAGE_CONFIG: ResolvedCoverageConfig = {
  reportsDir: 'coverage-tryscript',
  reporters: ['text', 'html'],
  include: ['dist/**'],
  exclude: [],
  excludeNodeModules: true,
  excludeAfterRemap: false,
  skipFull: false,
  allowExternal: false,
  src: 'src',
  monocart: false,
};

/**
 * Resolve coverage options by merging user config with defaults.
 */
export function resolveCoverageConfig(config?: CoverageConfig): ResolvedCoverageConfig {
  const resolved: ResolvedCoverageConfig = {
    reportsDir: config?.reportsDir ?? DEFAULT_COVERAGE_CONFIG.reportsDir,
    reporters: config?.reporters ?? DEFAULT_COVERAGE_CONFIG.reporters,
    include: config?.include ?? DEFAULT_COVERAGE_CONFIG.include,
    exclude: config?.exclude ?? DEFAULT_COVERAGE_CONFIG.exclude,
    excludeNodeModules: config?.excludeNodeModules ?? DEFAULT_COVERAGE_CONFIG.excludeNodeModules,
    excludeAfterRemap: config?.excludeAfterRemap ?? DEFAULT_COVERAGE_CONFIG.excludeAfterRemap,
    skipFull: config?.skipFull ?? DEFAULT_COVERAGE_CONFIG.skipFull,
    allowExternal: config?.allowExternal ?? DEFAULT_COVERAGE_CONFIG.allowExternal,
    src: config?.src ?? DEFAULT_COVERAGE_CONFIG.src,
    monocart: config?.monocart ?? DEFAULT_COVERAGE_CONFIG.monocart,
  };

  return config?.mergeLcov === undefined ? resolved : { ...resolved, mergeLcov: config.mergeLcov };
}

const CONFIG_FILES = ['tryscript.config.ts', 'tryscript.config.js', 'tryscript.config.mjs'];

/**
 * Load config file using dynamic import.
 * Supports TypeScript through tsx and JavaScript through Node.js.
 */
export async function loadConfig(baseDir: string): Promise<unknown> {
  for (const filename of CONFIG_FILES) {
    const configPath = resolve(baseDir, filename);
    if (existsSync(configPath)) {
      const configUrl = pathToFileURL(configPath).href;
      const module = filename.endsWith('.ts')
        ? await importTypeScriptConfig(configPath)
        : ((await import(configUrl)) as unknown);
      return unwrapDefaultExport(module, configPath);
    }
  }
  return {};
}

async function importTypeScriptConfig(configPath: string): Promise<unknown> {
  const { require: requireTypeScript } = await import('tsx/cjs/api');
  return requireTypeScript(configPath, import.meta.url) as unknown;
}

function unwrapDefaultExport(imported: unknown, configPath: string): unknown {
  let current = imported;
  const visited = new Set<object>();
  while (typeof current === 'object' && current !== null && 'default' in current) {
    if (visited.has(current)) {
      throw new Error(`Config module '${configPath}' contains cyclic default exports`);
    }
    visited.add(current);

    const defaultExport: unknown = current.default;
    if (defaultExport === undefined) {
      break;
    }
    current = defaultExport;
  }
  return current;
}

/**
 * Merge config with frontmatter overrides.
 * Frontmatter takes precedence over config file.
 */
export function mergeConfig(base: TryscriptConfig, frontmatter: TestConfig): TryscriptConfig {
  const merged: TryscriptConfig = {
    ...base,
    env: { ...base.env, ...frontmatter.env },
    patterns: { ...base.patterns, ...frontmatter.patterns },
    fixtures: [...(base.fixtures ?? []), ...(frontmatter.fixtures ?? [])],
    // Frontmatter paths have higher priority, so they come first
    path: [...(frontmatter.path ?? []), ...(base.path ?? [])],
  };

  if (frontmatter.cwd !== undefined) {
    merged.cwd = frontmatter.cwd;
  }
  if (frontmatter.sandbox !== undefined) {
    merged.sandbox = frontmatter.sandbox;
  }
  if (frontmatter.before !== undefined) {
    merged.before = frontmatter.before;
  }
  if (frontmatter.after !== undefined) {
    merged.after = frontmatter.after;
  }
  if (frontmatter.timeout !== undefined) {
    merged.timeout = frontmatter.timeout;
  }
  if (frontmatter.tests !== undefined) {
    merged.tests = frontmatter.tests;
  }
  if (frontmatter.coverage !== undefined) {
    merged.coverage = frontmatter.coverage;
  }

  return merged;
}

/**
 * Helper for typed config files.
 */
export function defineConfig(config: TryscriptConfig): TryscriptConfig {
  return config;
}
