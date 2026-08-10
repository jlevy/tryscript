import { describe, it, expect } from 'vitest';
import { normalizeOutput, matchOutput, matchAndCapture } from '../src/lib/matcher.js';

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

    it('keeps wildcard-looking text inside resolved paths literal', () => {
      const bracketedContext = { root: '/test/[..]', cwd: '/test/[??]' };

      expect(
        matchOutput(
          'File: /test/not-the-root/output.txt\n',
          'File: [ROOT]/output.txt\n',
          bracketedContext,
        ),
      ).toBe(false);
      expect(
        matchOutput(
          'Dir: /test/not-the-cwd/output.txt\n',
          'Dir: [CWD]/output.txt\n',
          bracketedContext,
        ),
      ).toBe(false);
    });

    it('accepts Windows path separators without turning path text into wildcards', () => {
      const windowsContext = {
        root: String.raw`C:\test\[..]`,
        cwd: String.raw`\\server\share\[??]`,
      };

      expect(
        matchOutput(
          String.raw`File: C:\test\[..]\output.txt` + '\n',
          'File: [ROOT]/output.txt\n',
          windowsContext,
        ),
      ).toBe(true);
      expect(
        matchOutput(
          String.raw`Dir: \\server\share\[??]\output.txt` + '\n',
          'Dir: [CWD]/output.txt\n',
          windowsContext,
        ),
      ).toBe(true);
      expect(
        matchOutput(
          String.raw`File: C:\test\anything\output.txt` + '\n',
          'File: [ROOT]/output.txt\n',
          windowsContext,
        ),
      ).toBe(false);
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

    it('retains source-only RegExp matching when flags are present', () => {
      expect(matchOutput('ready\n', '[WORD]\n', context, { WORD: /ready/i })).toBe(true);
      expect(matchOutput('READY\n', '[WORD]\n', context, { WORD: /ready/i })).toBe(false);
    });

    it('keeps built-in behavior when a custom name is reserved', () => {
      expect(matchOutput('anything\n', '[??]\n', context, { '??': 'must-not-replace' })).toBe(true);
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

    it('keeps private-use marker text literal', () => {
      const markerText = '\uE0000\uE000';

      expect(matchOutput(`${markerText} value\n`, `${markerText} [..]\n`, context)).toBe(true);
      expect(matchOutput(`${markerText} value\n`, `${markerText} exact\n`, context)).toBe(false);
    });
  });
});

describe('matchAndCapture', () => {
  const context = { root: '/test/root', cwd: '/test/cwd' };

  it('returns null on mismatch', () => {
    expect(matchAndCapture('hello\n', 'goodbye\n', context)).toBeNull();
  });

  it('returns empty captures for exact match', () => {
    const result = matchAndCapture('hello\n', 'hello\n', context);
    expect(result).not.toBeNull();
    expect(result!.captures).toEqual([]);
  });

  it('captures [..] single-line wildcard', () => {
    const result = matchAndCapture('Done in 1234ms\n', 'Done in [..]ms\n', context);
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(1);
    expect(result!.captures[0]).toMatchObject({
      category: 'generic',
      multiline: false,
      captured: '1234',
    });
  });

  it('captures [??] unknown single-line wildcard', () => {
    const result = matchAndCapture('Result: 42\n', 'Result: [??]\n', context);
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(1);
    expect(result!.captures[0]).toMatchObject({
      category: 'unknown',
      multiline: false,
      captured: '42',
    });
  });

  it('captures ... multi-line wildcard', () => {
    const result = matchAndCapture(
      'header\nline1\nline2\nfooter\n',
      'header\n...\nfooter\n',
      context,
    );
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(1);
    expect(result!.captures[0]).toMatchObject({
      category: 'generic',
      multiline: true,
      captured: 'line1\nline2\n',
    });
  });

  it('captures ??? unknown multi-line wildcard', () => {
    const result = matchAndCapture(
      'header\nline1\nline2\nfooter\n',
      'header\n???\nfooter\n',
      context,
    );
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(1);
    expect(result!.captures[0]).toMatchObject({
      category: 'unknown',
      multiline: true,
      captured: 'line1\nline2\n',
    });
  });

  it('captures named custom patterns', () => {
    const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
    const result = matchAndCapture('Version: 1.2.3\n', 'Version: [VERSION]\n', context, patterns);
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(1);
    expect(result!.captures[0]).toMatchObject({
      category: 'named',
      name: 'VERSION',
      captured: '1.2.3',
    });
  });

  it('keeps later captures aligned when a custom pattern has capture groups', () => {
    const patterns = {
      PAIR: '(\\d+)-(\\d+)',
      WORD: '[a-z]+',
    };
    const result = matchAndCapture(
      'Pair: 12-34, word: ready\n',
      'Pair: [PAIR], word: [WORD]\n',
      context,
      patterns,
    );

    expect(result?.captures).toMatchObject([
      { category: 'named', name: 'PAIR', captured: '12-34' },
      { category: 'named', name: 'WORD', captured: 'ready' },
    ]);
  });

  it('preserves numeric backreferences inside custom pattern captures', () => {
    const patterns = {
      REPEATED: '(a)\\1',
      WORD: '[a-z]+',
    };
    const result = matchAndCapture(
      'Value: aa, word: ready\n',
      'Value: [REPEATED], word: [WORD]\n',
      context,
      patterns,
    );

    expect(result?.captures).toMatchObject([
      { name: 'REPEATED', captured: 'aa' },
      { name: 'WORD', captured: 'ready' },
    ]);
  });

  it('keeps legacy decimal escapes from binding to wrapper captures', () => {
    const result = matchAndCapture('prefix-\x02\n', '[..]-[VALUE]\n', context, {
      VALUE: '\\2',
    });

    expect(result?.captures).toMatchObject([
      { category: 'generic', captured: 'prefix' },
      { category: 'named', name: 'VALUE', captured: '\x02' },
    ]);
  });

  it('keeps a named escape literal when the custom pattern defines no named groups', () => {
    const result = matchAndCapture('Value: k<missing>\n', 'Value: [VALUE]\n', context, {
      VALUE: '\\k<missing>',
    });

    expect(result?.captures).toMatchObject([
      { category: 'named', name: 'VALUE', captured: 'k<missing>' },
    ]);
  });

  it('rejects a missing named backreference when the custom pattern has named groups', () => {
    expect(() =>
      matchAndCapture('Value: ak<missing>\n', 'Value: [VALUE]\n', context, {
        VALUE: '(?<known>a)\\k<missing>',
      }),
    ).toThrow(/custom pattern \[VALUE\].*undefined named group 'missing'/iu);
  });

  it('namespaces named groups when a custom pattern appears more than once', () => {
    const patterns = { PAIR: '(?<digit>\\d)\\k<digit>' };
    const result = matchAndCapture('11 22\n', '[PAIR] [PAIR]\n', context, patterns);

    expect(result?.captures).toMatchObject([
      { name: 'PAIR', captured: '11' },
      { name: 'PAIR', captured: '22' },
    ]);
  });

  it('captures multiple wildcards in order with correct metadata', () => {
    const result = matchAndCapture(
      'Started at: 12:00\nline1\nline2\nDone in 500ms\n',
      'Started at: [..]\n...\nDone in [..]ms\n',
      context,
    );
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(3);
    expect(result!.captures[0]).toMatchObject({
      category: 'generic',
      multiline: false,
      captured: '12:00',
    });
    expect(result!.captures[1]).toMatchObject({
      category: 'generic',
      multiline: true,
      captured: 'line1\nline2\n',
    });
    expect(result!.captures[2]).toMatchObject({
      category: 'generic',
      multiline: false,
      captured: '500',
    });
  });

  it('captures mixed unknown and generic in position order', () => {
    const result = matchAndCapture('a: 100\nb\nc: 200\nd\n', 'a: [..]\n???\nd\n', context);
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(2);
    expect(result!.captures[0]).toMatchObject({
      category: 'generic',
      multiline: false,
      captured: '100',
    });
    expect(result!.captures[1]).toMatchObject({
      category: 'unknown',
      multiline: true,
      captured: 'b\nc: 200\n',
    });
  });

  it('captures interleaved types where unknown precedes generic', () => {
    const result = matchAndCapture(
      'line1\nline2\nvalue: 42\nfooter\n',
      '???\nvalue: [..]\nfooter\n',
      context,
    );
    expect(result).not.toBeNull();
    expect(result!.captures).toHaveLength(2);
    expect(result!.captures[0]).toMatchObject({
      category: 'unknown',
      multiline: true,
      captured: 'line1\nline2\n',
    });
    expect(result!.captures[1]).toMatchObject({
      category: 'generic',
      multiline: false,
      captured: '42',
    });
  });
});
