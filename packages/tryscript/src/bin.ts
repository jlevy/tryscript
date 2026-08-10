#!/usr/bin/env node
import { run } from './cli/cli.js';
import { registerOutputStreamErrorHandler } from './cli/lib/output-streams.js';

registerOutputStreamErrorHandler(process.stdout);
registerOutputStreamErrorHandler(process.stderr);
run(process.argv);
