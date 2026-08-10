/**
 * Output-stream error handling for the tryscript binary.
 */

import type { EventEmitter } from 'node:events';

type ExitProcess = (code: number) => void;

/**
 * Exit successfully when a downstream pipe closes, while preserving real stream
 * failures as uncaught errors.
 */
export function registerOutputStreamErrorHandler(
  stream: EventEmitter,
  exitProcess: ExitProcess = (code) => process.exit(code),
): void {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') {
      exitProcess(0);
      return;
    }
    throw error;
  });
}
