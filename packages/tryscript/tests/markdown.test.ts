import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getDocsPath } from '../src/cli/commands/docs.js';
import { getReadmePath } from '../src/cli/commands/readme.js';
import { formatMarkdown, shouldColorizeMarkdown } from '../src/cli/lib/markdown.js';

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('terminal Markdown formatting', () => {
  it('keeps nested shorter fences inside an enclosing code block', () => {
    const source = ['````markdown', '```console', '## inside', '```', '````', '## outside'].join(
      '\n',
    );

    const lines = formatMarkdown(source, true).split('\n');

    expect(lines[2]).toBe('\u001B[2m## inside\u001B[22m');
    expect(lines[5]).toContain('\u001B[34m## outside\u001B[39m');
  });

  it('recognizes tilde fences and requires a matching closing marker', () => {
    const source = ['~~~~text', '## inside', '```', '## still inside', '~~~~', '## outside'].join(
      '\n',
    );

    const lines = formatMarkdown(source, true).split('\n');

    expect(lines[1]).toBe('\u001B[2m## inside\u001B[22m');
    expect(lines[3]).toBe('\u001B[2m## still inside\u001B[22m');
    expect(lines[5]).toContain('\u001B[34m## outside\u001B[39m');
  });

  it('returns source unchanged when color is disabled', () => {
    const source = '# Heading\n\n`code`';
    expect(formatMarkdown(source, false)).toBe(source);
  });

  it('lets raw output override explicit color', () => {
    expect(shouldColorizeMarkdown({ raw: true, color: true }, true)).toBe(false);
    expect(shouldColorizeMarkdown({ color: true }, false)).toBe(true);
    expect(shouldColorizeMarkdown({}, true)).toBe(true);
  });

  it('loads tracked workspace documents when the CLI runs from source', () => {
    expect(getReadmePath()).toBe(join(WORKSPACE_ROOT, 'README.md'));
    expect(getDocsPath()).toBe(join(WORKSPACE_ROOT, 'docs', 'tryscript-reference.md'));
  });
});
