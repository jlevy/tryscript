/**
 * Docs command - Display the tryscript quick reference.
 *
 * Shows the tryscript-reference.md file, formatted for the terminal when interactive,
 * or as plain text when piped.
 */

import type { Command } from 'commander';

import {
  resolveMarkdownDocumentPath,
  showMarkdownDocument,
  type MarkdownDisplayOptions,
} from '../lib/markdown.js';

/**
 * Get the path to the tryscript-reference.md file.
 * Works both during development and when installed as a package.
 */
export function getDocsPath(): string {
  return resolveMarkdownDocumentPath(import.meta.url, ['docs', 'tryscript-reference.md']);
}

/**
 * Register the docs command.
 */
export function registerDocsCommand(program: Command): void {
  program
    .command('docs')
    .description('Print the syntax reference')
    .option('--raw', 'Print unformatted Markdown')
    .option('--color', 'Use color even when output is redirected')
    .action((options: MarkdownDisplayOptions) => {
      showMarkdownDocument(getDocsPath(), 'reference docs', options);
    });
}
