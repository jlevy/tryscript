import { describe, it, expect } from 'vitest';
import { expandExpectedOutput, shouldExpandCategory } from '../src/lib/expander.js';

const context = { root: '/test/root', cwd: '/test/cwd' };

describe('shouldExpandCategory', () => {
  it('unknown level only targets unknown', () => {
    expect(shouldExpandCategory('unknown', 'unknown')).toBe(true);
    expect(shouldExpandCategory('generic', 'unknown')).toBe(false);
    expect(shouldExpandCategory('named', 'unknown')).toBe(false);
  });

  it('generic level targets unknown and generic', () => {
    expect(shouldExpandCategory('unknown', 'generic')).toBe(true);
    expect(shouldExpandCategory('generic', 'generic')).toBe(true);
    expect(shouldExpandCategory('named', 'generic')).toBe(false);
  });

  it('all level targets everything', () => {
    expect(shouldExpandCategory('unknown', 'all')).toBe(true);
    expect(shouldExpandCategory('generic', 'all')).toBe(true);
    expect(shouldExpandCategory('named', 'all')).toBe(true);
  });
});

describe('expandExpectedOutput', () => {
  it('returns null on mismatch', () => {
    expect(expandExpectedOutput('goodbye\n', 'hello\n', context, 'unknown')).toBeNull();
  });

  it('expands [??] with unknown level', () => {
    const result = expandExpectedOutput('Result: [??]\n', 'Result: 42\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Result: 42\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('expands ??? with unknown level', () => {
    const result = expandExpectedOutput(
      'header\n???\nfooter\n',
      'header\nline1\nline2\nfooter\n',
      context,
      'unknown',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('header\nline1\nline2\nfooter\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('does NOT expand [..] with unknown level', () => {
    const result = expandExpectedOutput('Value: [..]\n', 'Value: 123\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Value: [..]\n');
    expect(result!.expandedCount).toBe(0);
  });

  it('expands [..] with generic level', () => {
    const result = expandExpectedOutput('Value: [..]\n', 'Value: 123\n', context, 'generic');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Value: 123\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('expands ... with generic level', () => {
    const result = expandExpectedOutput(
      'header\n...\nfooter\n',
      'header\nline1\nline2\nfooter\n',
      context,
      'generic',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('header\nline1\nline2\nfooter\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('does NOT expand named patterns with generic level', () => {
    const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
    const result = expandExpectedOutput(
      'v: [VERSION]\n',
      'v: 1.2.3\n',
      context,
      'generic',
      patterns,
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('v: [VERSION]\n');
    expect(result!.expandedCount).toBe(0);
  });

  it('expands named patterns with all level', () => {
    const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
    const result = expandExpectedOutput('v: [VERSION]\n', 'v: 1.2.3\n', context, 'all', patterns);
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('v: 1.2.3\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('handles mixed wildcards, only expanding targeted ones', () => {
    const result = expandExpectedOutput(
      'a: [..]\n???\nd\n',
      'a: 100\nb\nc: 200\nd\n',
      context,
      'unknown',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('a: [..]\nb\nc: 200\nd\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('returns zero expandedCount when nothing to expand', () => {
    const result = expandExpectedOutput('exact\n', 'exact\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedCount).toBe(0);
  });
});
