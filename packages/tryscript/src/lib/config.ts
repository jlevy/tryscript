import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestConfig } from './types.js';

export interface TryscriptConfig {
  /** Path to the binary to test (resolved relative to test file) */
  bin?: string;
  /** Command name alias for bin (e.g., 'mycli' lets you write '$ mycli --help') */
  binName?: string;
  /** Working directory for commands: '.' = test file dir (default), 'temp' = temp dir */
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  patterns?: Record<string, RegExp | string>;
  tests?: string[];
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
  };
}

/**
 * Helper for typed config files.
 */
export function defineConfig(config: TryscriptConfig): TryscriptConfig {
  return config;
}
