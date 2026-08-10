/**
 * Readme command - Display the README documentation.
 *
 * Shows the package README.md, formatted for the terminal when interactive,
 * or as plain text when piped.
 */

import type { Command } from 'commander';

import {
  resolveMarkdownDocumentPath,
  showMarkdownDocument,
  type MarkdownDisplayOptions,
} from '../lib/markdown.js';

/**
 * Get the path to the README.md file.
 * Works both during development and when installed as a package.
 */
export function getReadmePath(): string {
  return resolveMarkdownDocumentPath(import.meta.url, ['README.md']);
}

/** Print the tracked or packaged README through the shared Markdown renderer. */
export function showReadme(options: MarkdownDisplayOptions): void {
  showMarkdownDocument(getReadmePath(), 'README', options);
}

/**
 * Register the readme command.
 */
export function registerReadmeCommand(program: Command): void {
  program
    .command('readme')
    .description('Print the README')
    .option('--raw', 'Print unformatted Markdown')
    .option('--color', 'Use color even when output is redirected')
    .action(showReadme);
}
