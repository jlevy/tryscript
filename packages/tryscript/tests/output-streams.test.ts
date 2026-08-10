import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerOutputStreamErrorHandler } from '../src/cli/lib/output-streams.js';

describe('registerOutputStreamErrorHandler', () => {
  it('exits successfully when a downstream pipe closes', () => {
    const stream = new EventEmitter();
    const exitProcess = vi.fn();
    registerOutputStreamErrorHandler(stream, exitProcess);

    stream.emit('error', Object.assign(new Error('closed pipe'), { code: 'EPIPE' }));

    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(0);
  });

  it('preserves non-EPIPE stream failures', () => {
    const stream = new EventEmitter();
    registerOutputStreamErrorHandler(stream, vi.fn());
    const error = Object.assign(new Error('stream failed'), { code: 'EIO' });

    expect(() => stream.emit('error', error)).toThrow(error);
  });
});
