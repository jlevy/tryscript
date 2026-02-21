import { describe, it, expect } from 'vitest';
import { normalizeOutput, matchOutput } from '../src/lib/matcher.js';

describe('normalizeOutput', () => {
  it('normalizes CRLF to LF', () => {
    expect(normalizeOutput('line1\r\nline2\r\n')).toBe('line1\nline2\n');
  });

  it('trims trailing whitespace from lines', () => {
    expect(normalizeOutput('hello   \nworld  \n')).toBe('hello\nworld\n');
  });

  it('handles empty output', () => {
    expect(normalizeOutput('')).toBe('');
    expect(normalizeOutput('\n')).toBe('');
    expect(normalizeOutput('\n\n\n')).toBe('');
  });

  it('collapses multiple trailing newlines', () => {
    expect(normalizeOutput('hello\n\n\n')).toBe('hello\n');
  });
});

describe('matchOutput', () => {
  const context = { root: '/test/root', cwd: '/test/cwd' };

  describe('exact matching', () => {
    it('matches identical output', () => {
      expect(matchOutput('hello world\n', 'hello world\n', context)).toBe(true);
    });

    it('rejects different output', () => {
      expect(matchOutput('hello\n', 'goodbye\n', context)).toBe(false);
    });

    it('matches empty expected and actual', () => {
      expect(matchOutput('', '', context)).toBe(true);
    });
  });

  describe('[..] pattern (any characters on line)', () => {
    it('matches any content on the line', () => {
      expect(matchOutput('Done in 1234ms\n', 'Done in [..]ms\n', context)).toBe(true);
      expect(matchOutput('Done in 1ms\n', 'Done in [..]ms\n', context)).toBe(true);
      expect(matchOutput('Done in ms\n', 'Done in [..]ms\n', context)).toBe(true);
    });

    it('does not match across newlines', () => {
      expect(matchOutput('line1\nline2\n', '[..]\n', context)).toBe(false);
    });

    it('matches at start and end of line', () => {
      expect(matchOutput('prefix-content\n', '[..]-content\n', context)).toBe(true);
      expect(matchOutput('content-suffix\n', 'content-[..]\n', context)).toBe(true);
    });
  });

  describe('... pattern (zero or more lines)', () => {
    it('matches zero lines', () => {
      expect(matchOutput('header\nfooter\n', 'header\n...\nfooter\n', context)).toBe(true);
    });

    it('matches one line', () => {
      expect(matchOutput('header\nmiddle\nfooter\n', 'header\n...\nfooter\n', context)).toBe(true);
    });

    it('matches multiple lines', () => {
      expect(
        matchOutput('header\nline1\nline2\nline3\nfooter\n', 'header\n...\nfooter\n', context),
      ).toBe(true);
    });
  });

  describe('[ROOT] and [CWD] placeholders', () => {
    it('replaces [ROOT] with root path', () => {
      expect(
        matchOutput('File: /test/root/output.txt\n', 'File: [ROOT]/output.txt\n', context),
      ).toBe(true);
    });

    it('replaces [CWD] with cwd path', () => {
      expect(matchOutput('Dir: /test/cwd/subdir\n', 'Dir: [CWD]/subdir\n', context)).toBe(true);
    });
  });

  describe('custom patterns', () => {
    it('matches custom string pattern', () => {
      const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
      expect(matchOutput('Version: 1.2.3\n', 'Version: [VERSION]\n', context, patterns)).toBe(true);
      expect(matchOutput('Version: 10.20.30\n', 'Version: [VERSION]\n', context, patterns)).toBe(
        true,
      );
    });

    it('matches custom RegExp pattern', () => {
      const patterns = { UUID: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ };
      expect(
        matchOutput(
          'ID: 550e8400-e29b-41d4-a716-446655440000\n',
          'ID: [UUID]\n',
          context,
          patterns,
        ),
      ).toBe(true);
    });
  });

  describe('[??] pattern (unknown single-line wildcard)', () => {
    it('matches any content on the line (same as [..])', () => {
      expect(matchOutput('Done in 1234ms\n', 'Done in [??]ms\n', context)).toBe(true);
      expect(matchOutput('Done in ms\n', 'Done in [??]ms\n', context)).toBe(true);
    });

    it('does not match across newlines', () => {
      expect(matchOutput('line1\nline2\n', '[??]\n', context)).toBe(false);
    });
  });

  describe('??? pattern (unknown multi-line wildcard)', () => {
    it('matches zero lines', () => {
      expect(matchOutput('header\nfooter\n', 'header\n???\nfooter\n', context)).toBe(true);
    });

    it('matches one line', () => {
      expect(matchOutput('header\nmiddle\nfooter\n', 'header\n???\nfooter\n', context)).toBe(true);
    });

    it('matches multiple lines', () => {
      expect(
        matchOutput('header\nline1\nline2\nline3\nfooter\n', 'header\n???\nfooter\n', context),
      ).toBe(true);
    });

    it('matches at start of output', () => {
      expect(matchOutput('line1\nline2\nfooter\n', '???\nfooter\n', context)).toBe(true);
    });

    it('matches entire output', () => {
      expect(matchOutput('line1\nline2\n', '???\n', context)).toBe(true);
    });
  });

  describe('combined patterns', () => {
    it('handles multiple patterns in one output', () => {
      expect(
        matchOutput(
          'Built in 123ms\nOutput: /test/root/dist\n',
          'Built in [..]ms\nOutput: [ROOT]/dist\n',
          context,
        ),
      ).toBe(true);
    });
  });
});
