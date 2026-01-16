import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestConfig, CoverageConfig } from './types.js';

/** Fixture configuration for copying files to sandbox directory */
export interface Fixture {
  /** Source path (resolved relative to test file) */
  source: string;
  /** Destination path (resolved relative to sandbox dir) */
  dest?: string;
}

export interface TryscriptConfig {
  /** Working directory for commands (default: test file directory) */
  cwd?: string;
  /** Run in isolated sandbox: true = empty temp, path = copy to temp */
  sandbox?: boolean | string;
  /** Fixtures to copy to sandbox directory before tests */
  fixtures?: (string | Fixture)[];
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
   * Directories to prepend to PATH (resolved relative to test file).
   * Makes executables in these directories available by name in commands.
   */
  path?: string[];
}

/** Default coverage configuration values. */
export const DEFAULT_COVERAGE_CONFIG: Required<CoverageConfig> = {
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
export function resolveCoverageConfig(config?: CoverageConfig): Required<CoverageConfig> {
  return {
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
}

const CONFIG_FILES = ['tryscript.config.ts', 'tryscript.config.js', 'tryscript.config.mjs'];

/**
 * Load config file using dynamic import.
 * Supports both TypeScript (via tsx/ts-node) and JavaScript configs.
 */
export async function loadConfig(baseDir: string): Promise<TryscriptConfig> {
  for (const filename of CONFIG_FILES) {
    const configPath = resolve(baseDir, filename);
    if (existsSync(configPath)) {
      const configUrl = pathToFileURL(configPath).href;
      const module = (await import(configUrl)) as { default?: TryscriptConfig } | TryscriptConfig;
      return (module as { default?: TryscriptConfig }).default ?? (module as TryscriptConfig);
    }
  }
  return {};
}

/**
 * Merge config with frontmatter overrides.
 * Frontmatter takes precedence over config file.
 */
export function mergeConfig(base: TryscriptConfig, frontmatter: TestConfig): TryscriptConfig {
  return {
    ...base,
    ...frontmatter,
    env: { ...base.env, ...frontmatter.env },
    patterns: { ...base.patterns, ...frontmatter.patterns },
    fixtures: [...(base.fixtures ?? []), ...(frontmatter.fixtures ?? [])],
    // Frontmatter paths have higher priority, so they come first
    path: [...(frontmatter.path ?? []), ...(base.path ?? [])],
  };
}

/**
 * Helper for typed config files.
 */
export function defineConfig(config: TryscriptConfig): TryscriptConfig {
  return config;
}
