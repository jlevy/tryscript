# Plan: Refactor cli.tryscript.md to Use Clean File Setup

## Problem

The `cli.tryscript.md` and `meta.tryscript.md` files used ugly inline node commands to
create test files:

```bash
$ node -e "require('fs').writeFileSync('/tmp/pass-cli.tryscript.md', '# Test: Pass\n\n\`\`\`console\n\$ echo ok\nok\n? 0\n\`\`\`\n')"
```

This is:

- Unreadable due to deeply nested escaping
- Error-prone
- A poor example for users

## Investigation: Heredocs

Initial plan was to use Bash heredocs:

```bash
$ cat > pass.tryscript.md << 'EOF'
# Test: Pass

```console
$ echo ok
ok
? 0
```
EOF
```

**Problem Discovered**: The parser regex `/```(console|bash)\r?\n([\s\S]*?)```/g`
matches exactly 3 backticks and doesn't support extended fences (4+ backticks).
This causes nested code fences in heredocs to be parsed as separate test blocks,
breaking the tests.

## Solution: Fixture Files

Use the existing `fixtures:` directive to copy clean, readable fixture files to
the sandbox:

```yaml
---
sandbox: true
fixtures:
  - cli-fixtures/pass.md
  - cli-fixtures/fail.md
---
```

### Advantages

1. **Clean and readable**: Each fixture is a proper file with syntax highlighting
2. **No escaping**: Content is exactly what will be tested
3. **Maintainable**: Easy to edit individual fixtures
4. **Works today**: No parser changes needed
5. **Good examples**: Users can copy the pattern for their own tests

## Changes Made

### 1. Created `tests/cli-fixtures/` Directory

16 fixture files for CLI tests:

- `pass.md`, `fail.md` - Basic pass/fail tests
- `verbose.md`, `quiet.md` - CLI option tests
- `filter.md`, `failfast.md` - Multi-test files
- `exitcode.md` - Exit code mismatch test
- `env.md`, `patterns.md` - Frontmatter tests
- `multi1.md`, `multi2.md` - Multiple file tests
- `counts.md` - Summary statistics test
- `meta-pass.md`, `meta-fail.md`, `meta-elision.md`, `meta-multi.md` - Meta-tests

### 2. Updated `cli.tryscript.md`

- Added `sandbox: true` and `fixtures:` directive
- Updated all 11 tests to reference fixture files
- Changed file paths from `/tmp/*.tryscript.md` to `*.md` (sandbox-relative)
- Updated expected output patterns (`[..]pass.md` instead of `[..]pass.tryscript.md`)

### 3. Updated `meta.tryscript.md`

- Added `fixtures:` directive for 4 meta-test fixtures
- Removed all `node -e` writeFileSync commands
- Updated to reference fixture files

## Outcome

- All 74 golden tests pass
- Test files are readable and maintainable
- Fixtures serve as good examples for users
- Each fixture file has proper syntax highlighting

## Future Consideration

If heredoc support is desired in the future, the parser would need to:

1. Support extended fences (4+ backticks): `````console ... `````
2. Match closing fence by counting backticks

This would enable inline file creation without fixture files.
