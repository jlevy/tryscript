/**
 * CLI entry point for tryscript.
 *
 * Configures Commander.js with colored help and registers all subcommands.
 */

import { Command } from 'commander';
import { VERSION } from '../index.js';
import { registerRunCommand } from './commands/run.js';
import { registerReadmeCommand } from './commands/readme.js';
import { registerDocsCommand } from './commands/docs.js';
import { withColoredHelp, logError } from './lib/shared.js';

export function run(argv: string[]): void {
  const program = withColoredHelp(
    new Command()
      .name('tryscript')
      .version(VERSION, '--version', 'Show version number')
      .description('Golden testing for CLI applications')
      .showHelpAfterError('(use --help for usage)'),
  );

  // Register subcommands
  registerRunCommand(program);
  registerReadmeCommand(program);
  registerDocsCommand(program);

  // Default action: show help when no command given
  program.action(() => {
    program.help();
  });

  program.parseAsync(argv).catch((err: Error) => {
    logError(`Error: ${err.message}`);
    process.exit(2);
  });
}
