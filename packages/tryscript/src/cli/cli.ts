/**
 * CLI entry point for tryscript.
 *
 * Configures Commander.js with colored help and registers all subcommands.
 */

import { Command } from 'commander';
import { VERSION } from '../index.js';
import { registerRunCommand } from './commands/run.js';
import { registerCoverageCommand } from './commands/coverage.js';
import { registerReadmeCommand } from './commands/readme.js';
import { registerDocsCommand } from './commands/docs.js';
import { withColoredHelp, logError } from './lib/shared.js';

export function run(argv: string[]): void {
  const program = withColoredHelp(
    new Command()
      .name('tryscript')
      .version(VERSION, '--version', 'Print the version')
      .description('Markdown golden tests for CLI applications')
      .configureOutput({
        outputError: (message, write) => {
          write(message.replace(/^error:/u, 'Error:'));
        },
      })
      .showHelpAfterError('Run tryscript --help for usage.'),
  );

  registerRunCommand(program);
  registerCoverageCommand(program);
  registerReadmeCommand(program);
  registerDocsCommand(program);

  program.action(() => {
    program.help();
  });

  program.parseAsync(argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logError(message);
    process.exit(2);
  });
}
