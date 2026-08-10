import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDocsPath } from '../src/cli/commands/docs.js';
import { getReadmePath } from '../src/cli/commands/readme.js';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('documentation paths', () => {
  it('loads tracked workspace documents when the CLI runs from source', () => {
    expect(getReadmePath()).toBe(join(WORKSPACE_ROOT, 'README.md'));
    expect(getDocsPath()).toBe(join(WORKSPACE_ROOT, 'docs', 'tryscript-reference.md'));
  });
});
