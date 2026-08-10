/**
 * Docs command - Display the tryscript quick reference.
 *
 * Prints the tryscript-reference.md source without changing its bytes.
 */

import { Option, type Command } from 'commander';

import { printDocumentation, resolveDocumentationPath } from '../lib/documentation.js';

/**
 * Get the path to the tryscript-reference.md file.
 * Works both during development and when installed as a package.
 */
export function getDocsPath(): string {
  return resolveDocumentationPath(import.meta.url, ['docs', 'tryscript-reference.md']);
}

/**
 * Register the docs command.
 */
export function registerDocsCommand(program: Command): void {
  program
    .command('docs')
    .description('Print the syntax reference')
    .addOption(new Option('--raw', 'Deprecated; documentation is always raw').hideHelp())
    .addOption(new Option('--color', 'Deprecated; documentation is never colorized').hideHelp())
    .action(() => {
      printDocumentation(getDocsPath(), 'reference docs');
    });
}
