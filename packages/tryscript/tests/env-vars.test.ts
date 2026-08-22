import { describe, expect, it } from 'vitest';
import { createEnvExpander, expandEnvVars } from '../src/lib/env-vars.js';

describe('expandEnvVars', () => {
  const env = { TOOL_ROOT: '/opt/tool', HOLDS_REF: '$TOOL_ROOT' };

  it('expands bare and braced references', () => {
    expect(expandEnvVars('$TOOL_ROOT/bin', env)).toBe('/opt/tool/bin');
    expect(expandEnvVars('${TOOL_ROOT}/bin', env)).toBe('/opt/tool/bin');
  });

  it('falls back to the process environment', () => {
    process.env.TRYSCRIPT_TEST_FALLBACK = 'from-process';
    try {
      expect(expandEnvVars('$TRYSCRIPT_TEST_FALLBACK', env)).toBe('from-process');
    } finally {
      delete process.env.TRYSCRIPT_TEST_FALLBACK;
    }
  });

  it('expands an undefined name to the empty string', () => {
    expect(expandEnvVars('$NOT_SET_ANYWHERE_12345', env)).toBe('');
  });

  it('treats `$$` as a literal `$`', () => {
    // Without an escape there is no way to keep a `$` in an `env:` value: `$ssw0rd`
    // parses as a reference and expands away, silently truncating the value.
    expect(expandEnvVars('p$$ssw0rd', env)).toBe('p$ssw0rd');
    expect(expandEnvVars('costs $$5', env)).toBe('costs $5');
    expect(expandEnvVars('$$TOOL_ROOT', env)).toBe('$TOOL_ROOT');
  });

  it('does not rescan substituted values', () => {
    // A single combined pattern keeps this single-pass. Expanding in two passes would
    // let the braced pass emit `$TOOL_ROOT` and the bare pass expand it again.
    expect(expandEnvVars('${HOLDS_REF}', env)).toBe('$TOOL_ROOT');
  });

  it('leaves text that is not a valid reference alone', () => {
    expect(expandEnvVars('$1 == 1', env)).toBe('$1 == 1');
    expect(expandEnvVars('100% $ off', env)).toBe('100% $ off');
  });
});

describe('createEnvExpander', () => {
  it('binds a custom environment across calls', () => {
    const expand = createEnvExpander({ TRYSCRIPT_ROOT: '/project' });
    expect(expand('$TRYSCRIPT_ROOT/dist')).toBe('/project/dist');
    expect(expand('${TRYSCRIPT_ROOT}/src')).toBe('/project/src');
  });
});
