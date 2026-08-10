/**
 * Readme command - Display the README documentation.
 *
 * Prints the package README.md source without changing its bytes.
 */

import { Option, type Command } from 'commander';

import { printDocumentation, resolveDocumentationPath } from '../lib/documentation.js';

/**
 * Get the path to the README.md file.
 * Works both during development and when installed as a package.
 */
export function getReadmePath(): string {
  return resolveDocumentationPath(import.meta.url, ['README.md']);
}

/** Print the tracked or packaged README. */
export function showReadme(): void {
  printDocumentation(getReadmePath(), 'README');
}

/**
 * Register the readme command.
 */
export function registerReadmeCommand(program: Command): void {
  program
    .command('readme')
    .description('Print the README')
    .addOption(new Option('--raw', 'Deprecated; documentation is always raw').hideHelp())
    .addOption(new Option('--color', 'Deprecated; documentation is never colorized').hideHelp())
    .action(() => {
      showReadme();
    });
}
