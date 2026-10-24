import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateConfig } from '../src/lib/parser.js';
import { TestConfigSchema } from '../src/lib/types.js';

describe('Zod 4 configuration validation', () => {
  it('accepts string environment values and string or RegExp patterns', () => {
    const config = {
      env: { NO_COLOR: '1', EMPTY: '' },
      patterns: { WORD: '[a-z]+', DIGIT: /\d+/ },
    };
    expect(TestConfigSchema.parse(config)).toEqual(config);
    expect(validateConfig(config)).toEqual([]);
  });

  it('reports invalid environment values at their entry paths', () => {
    expect(validateConfig({ env: { NO_COLOR: 1, GOOD: 'ok' } })).toEqual([
      { path: 'env.NO_COLOR', message: 'Invalid input: expected string, received number' },
    ]);
  });

  it('flattens pattern union errors while preserving the record entry path', () => {
    expect(validateConfig({ patterns: { WORD: 42 } })).toEqual([
      { path: 'patterns.WORD', message: 'Invalid input: expected string, received number' },
    ]);
  });

  it('selects the actionable object branch of fixture union errors', () => {
    expect(validateConfig({ fixtures: [{ source: 'input.txt', dst: 'out.txt' }] })).toEqual([
      { path: 'fixtures.0.dst', message: "unknown config key 'dst'" },
    ]);
    expect(validateConfig({ fixtures: [{ source: 42 }] })).toEqual([
      { path: 'fixtures.0.source', message: 'Invalid input: expected string, received number' },
    ]);
  });

  it('rejects an oversized constrained array before validating its items', () => {
    let validatedItems = 0;
    const schema = z
      .array(
        z.string().superRefine(() => {
          validatedItems++;
        }),
      )
      .max(2);
    const result = schema.safeParse(['one', 'two', 'three']);
    expect(result.success).toBe(false);
    expect(validatedItems).toBe(0);
  });
});
