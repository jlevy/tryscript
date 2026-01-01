import { Command } from 'commander';
import pc from 'picocolors';
import { VERSION } from '../index.js';
import { runCommand } from './commands/run.js';

export function run(argv: string[]): void {
  const program = new Command()
    .name('tryscript')
    .version(VERSION, '--version', 'Show version number')
    .description('Golden testing for CLI applications')
    .showHelpAfterError('(use --help for usage)')
    .argument('[files...]', 'Test files to run (default: **/*.tryscript.md)')
    .option('--update', 'Update golden files with actual output')
    .option('--diff', 'Show diff on failure (default: true)')
    .option('--no-diff', 'Hide diff on failure')
    .option('--fail-fast', 'Stop on first failure')
    .option('--filter <pattern>', 'Filter tests by name pattern')
    .option('--verbose', 'Show detailed output including passing test output')
    .option('--quiet', 'Suppress non-essential output (only show failures)')
    .action(runCommand);

  program.parseAsync(argv).catch((err: Error) => {
    console.error(pc.red(`Error: ${err.message}`));
    process.exit(2);
  });
}
