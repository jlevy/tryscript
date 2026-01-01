# Feature Validation: Tryscript CLI Golden Testing

## Purpose

This is a validation spec for the tryscript CLI golden testing implementation,
including core functionality and markform pattern backfill.

**Feature Plan:** [plan-2025-01-01-tryscript-cli-golden-testing.md](../plan-2025-01-01-tryscript-cli-golden-testing.md)

## Stage 4: Validation Stage

## Validation Planning

This validation covers:
1. Core tryscript golden testing functionality
2. Markform pattern backfill (CLI docs, development/publishing guides, CI/CD)

## Automated Validation (Testing Performed)

### Unit Testing

The following unit tests are implemented and passing (45 tests total):

**Matcher Tests** (`tests/matcher.test.ts` - 18 tests):
- Output normalization (line endings, trailing whitespace, ANSI stripping)
- Elision pattern matching: `[..]`, `...`, `[EXE]`, `[ROOT]`, `[CWD]`
- Custom pattern support via frontmatter configuration
- Edge cases for empty output, whitespace-only output

**Parser Tests** (`tests/parser.test.ts` - 5 tests):
- YAML frontmatter parsing (bin, env, timeout, patterns)
- Console code block extraction
- Test name extraction from headers
- Exit code parsing (`? N` syntax)
- Multi-block file parsing

**Runner Tests** (`tests/runner.test.ts` - 11 tests):
- Command execution with proper exit codes
- Environment variable inheritance and override
- Timeout handling
- Working directory setup and cleanup
- Temp directory isolation

**Updater Tests** (`tests/updater.test.ts` - 6 tests):
- Golden file update detection
- Output replacement in markdown files
- Exit code updates
- Atomic file writes

### Integration and End-to-End Testing

**CLI Integration Tests** (`tests/cli.integration.test.ts` - 5 tests):
- `--help` output validation
- `--version` output validation
- Passing test file execution
- Failing test file reporting with diff
- Exit code 1 when no test files found

**Self-Tests (Golden Tests)** (`tests/*.tryscript.md` - 34 tests):
- `basic.tryscript.md`: Core functionality validation
- `elisions.tryscript.md`: All elision patterns including `[ROOT]`, `[CWD]`
- `config.tryscript.md`: Frontmatter configuration validation
- `features.tryscript.md`: Advanced features (multi-block, exit codes, filtering)
- `meta.tryscript.md`: Meta-tests (tryscript testing itself)

**All tests pass:**
```
Test Files  5 passed (5)
Tests       45 passed (45)
```

### Manual Testing Needed

The following manual validation steps should be performed by the user:

#### 1. CLI Self-Documenting Commands

Test the new readme and docs commands:

```bash
# Test readme command with formatting
pnpm tryscript readme

# Test readme command raw output
pnpm tryscript readme --raw

# Test docs command with formatting
pnpm tryscript docs

# Test docs command raw output
pnpm tryscript docs --raw

# Verify help shows both commands
pnpm tryscript --help
```

**Expected:** Commands display markdown with terminal colors (headers in cyan/blue,
code in yellow). Raw mode shows plain markdown.

#### 2. Golden Test Execution

Run the golden tests to verify core functionality:

```bash
# Run all self-tests
pnpm test:golden

# Run with verbose output to see test details
node packages/tryscript/dist/bin.js tests/ --verbose
```

**Expected:** All 34 self-tests pass with green checkmarks.

#### 3. Update Mode

Test the update mode for golden files:

```bash
# Create a test file with wrong expected output
echo '# Test: Update test

```console
$ echo hello
wrong output
? 0
```' > /tmp/update-test.tryscript.md

# Run with --update flag
node packages/tryscript/dist/bin.js /tmp/update-test.tryscript.md --update

# Verify file was updated
cat /tmp/update-test.tryscript.md
```

**Expected:** The file should be updated with "hello" as the expected output.

#### 4. Documentation Review

Review the following documentation for accuracy and completeness:

- [ ] `docs/development.md` - Development guide
- [ ] `docs/publishing.md` - Publishing workflow
- [ ] `packages/tryscript/docs/tryscript-reference.md` - Quick reference
- [ ] `packages/tryscript/README.md` - Package README

#### 5. Package Contents Verification

Verify the package includes all necessary files:

```bash
cd packages/tryscript
pnpm pack --dry-run
```

**Expected:** Output should include:
- `dist/` (compiled code)
- `docs/` (reference documentation)
- `README.md`

#### 6. CI/CD Workflow Review

Review the GitHub Actions workflows:

- [ ] `.github/workflows/ci.yml` - CI workflow with coverage
- [ ] `.github/workflows/release.yml` - Release workflow with OIDC

**Note:** The release workflow requires one-time OIDC setup on npm.org before
first automated publish. See `docs/publishing.md` for setup instructions.

## Open Questions

None - all functionality has been implemented and tested.

## Beads Summary

All beads have been closed:
- **tryscript-9ck**: Tryscript CLI Golden Testing Implementation (epic, closed)
- **tryscript-3zu**: Complete tryscript spec implementation (epic, closed)
- **tryscript-6ci**: Remaining spec gaps (epic, closed)
- **tryscript-vt5**: Backfill markform patterns (epic, closed)
  - tryscript-vt5.1: Add readme CLI command (closed)
  - tryscript-vt5.2: Add docs CLI command (closed)
  - tryscript-vt5.3: Add development.md guide (closed)
  - tryscript-vt5.4: Add publishing.md release guide (closed)
  - tryscript-vt5.5: Update CI workflow (closed)
  - tryscript-vt5.6: Add release workflow (closed)
