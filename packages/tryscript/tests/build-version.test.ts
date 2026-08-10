import { describe, expect, it } from 'vitest';
import { getGitVersion } from '../build-version.js';

describe('getGitVersion', () => {
  it('derives a development version from argument-array Git commands', () => {
    const calls: string[][] = [];
    const runGit = (args: readonly string[]): string => {
      calls.push([...args]);
      switch (args[0]) {
        case 'describe':
          return 'v1.2.3';
        case 'rev-list':
          return '4';
        case 'rev-parse':
          return 'abcdef1';
        case 'status':
          return '';
        default:
          throw new Error(`Unexpected Git command: ${args.join(' ')}`);
      }
    };

    expect(getGitVersion('0.1.7', runGit)).toBe('1.2.4-dev.4.abcdef1');
    expect(calls).toContainEqual(['rev-list', 'v1.2.3..HEAD', '--count']);
  });

  it('falls back before reusing an unsafe or malformed tag', () => {
    const calls: string[][] = [];
    const runGit = (args: readonly string[]): string => {
      calls.push([...args]);
      return 'v1.2.3; touch untrusted-output';
    };

    expect(getGitVersion('0.1.7', runGit)).toBe('0.1.7');
    expect(calls).toEqual([['describe', '--tags', '--abbrev=0']]);
  });
});
