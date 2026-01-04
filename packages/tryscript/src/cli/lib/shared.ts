/**
 * Shared CLI utilities for consistent output formatting and color usage.
 *
 * This module provides:
 * - Color utilities via picocolors
 * - Commander.js help text styling
 * - Logging helpers for consistent output
 */

import type { Command } from 'commander';
import pc from 'picocolors';

/**
 * Shared color utilities for consistent terminal output.
 */
export const colors = {
  success: (s: string) => pc.green(s),
  error: (s: string) => pc.red(s),
  warn: (s: string) => pc.yellow(s),
};

/**
 * Status indicators with emoji.
 */
export const status = {
  pass: pc.green('✓'),
  fail: pc.red('✗'),
  skip: pc.yellow('○'),
  update: pc.yellow('↻'),
};

/**
 * Configure Commander.js with colored help text.
 * Applies consistent styling: cyan titles, green commands, yellow options.
 */
export function withColoredHelp<T extends Command>(cmd: T): T {
  cmd.configureHelp({
    styleTitle: (str) => pc.bold(pc.cyan(str)),
    styleCommandText: (str) => pc.green(str),
    styleOptionText: (str) => pc.yellow(str),
    showGlobalOptions: true,
  });
  return cmd;
}

/**
 * Format a duration in milliseconds for display.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Log a warning message to stderr.
 */
export function logWarn(message: string): void {
  console.error(colors.warn(message));
}

/**
 * Log an error message to stderr.
 */
export function logError(message: string): void {
  console.error(colors.error(message));
}
