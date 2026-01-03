# Plan: Refactor cli.tryscript.md to Use Heredocs

## Problem

The `cli.tryscript.md` file uses ugly inline node commands to create test files:

```bash
$ node -e "require('fs').writeFileSync('/tmp/pass-cli.tryscript.md', '# Test: Pass\n\n\`\`\`console\n\$ echo ok\nok\n? 0\n\`\`\`\n')"
```

This is:
- Unreadable due to deeply nested escaping
- Error-prone
- A poor example for users

## Solution

Use Bash heredocs with sandbox mode. Heredocs already work since tryscript runs
commands via shell.

### Before (Ugly)
```bash
$ node -e "require('fs').writeFileSync('/tmp/pass-cli.tryscript.md', '...')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run /tmp/pass-cli.tryscript.md
```

### After (Clean)
```bash
$ cat > pass.tryscript.md << 'EOF'
# Test: Pass

```console
$ echo ok
ok
? 0
```
EOF
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run pass.tryscript.md
```

## Changes Required

### 1. Enable Sandbox Mode

Add `sandbox: true` to frontmatter so files are created in temp directory and
cleaned up automatically.

```yaml
---
sandbox: true
env:
  NO_COLOR: "1"
---
```

### 2. Convert Each Test

There are 11 tests using the ugly pattern:

| Line | Test Name | Complexity |
|------|-----------|------------|
| 93 | Run passing test | Simple - 1 file |
| 104 | Run failing test | Simple - 1 file |
| 117 | --verbose | Simple - 1 file |
| 128 | --quiet | Simple - 1 file |
| 136 | --filter | Medium - 2 tests in 1 file |
| 147 | --fail-fast | Medium - 2 tests in 1 file |
| 169 | Exit code mismatch | Simple - 1 file |
| 182 | Custom env vars | Medium - frontmatter + test |
| 193 | Custom patterns | Medium - frontmatter + test |
| 206 | Multiple files | Complex - 2 separate files |
| 222 | Summary counts | Medium - 3 tests in 1 file |

### 3. Heredoc Format

Use single-quoted delimiter to prevent shell expansion:

```bash
$ cat > filename.tryscript.md << 'EOF'
content here
EOF
```

Key points:
- `'EOF'` (quoted) prevents `$` expansion inside heredoc
- Files created in sandbox (cwd), not /tmp
- Use relative paths since we're in sandbox

### 4. Handle Special Cases

**Tests with frontmatter** (env, patterns): Include YAML in heredoc content

**Multiple files**: Use separate heredocs or combine into one command block

**Failure tests**: Keep `2>&1; echo "exit: $?"` pattern for capturing exit codes

## Execution Order

1. Add `sandbox: true` to frontmatter
2. Convert tests one by one, starting with simplest
3. Run `pnpm test:golden` after each change to verify
4. Final validation with full test suite

## Expected Outcome

- All 11 tests converted to heredoc syntax
- Tests remain functionally equivalent
- Dramatically improved readability
- Better example for users to follow
