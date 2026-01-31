# Plan Spec: Manual Testing Workflows and Validation Modes

**Status**: PLANNING

## Purpose

This plan designs features to support "manual" test scripts - tests that facilitate
human or agent review rather than strict pass/fail automation. This addresses use
cases where outputs are inherently variable (LLM responses, web search results) or
require subjective evaluation (visual UX, complex formatting).

## Background

### Current Tryscript Model

Tryscript is designed as an automated golden test framework:

1. Run commands, capture outputs
2. Compare against expected golden outputs
3. Pass if matches (with elision patterns), fail otherwise
4. Exit with non-zero status on any failure

This works well for deterministic CLIs but breaks down for:

- **Variable outputs**: LLM/AI responses, web scraping, search results, timestamps
- **Subjective evaluation**: Visual appearance, UX flows, formatting quality
- **Exploratory testing**: New feature development, debugging sessions
- **Documentation verification**: Ensuring examples still run correctly

### The "Update and Review" Workflow

Users have discovered an informal workflow:

```bash
# Run in update mode (always captures actual output)
tryscript run tests/llm-responses.tryscript.md --update

# Review the diff to manually validate
git diff tests/llm-responses.tryscript.md
```

This works but has friction:

- Tests still "pass" (exit 0) even when review is needed
- No way to distinguish automated vs manual tests
- No structured way to document review criteria
- CI/CD doesn't know to pause for review

### User Request

The user wants to:

1. Formalize workflows for manual testing scenarios
2. Potentially add a "validation mode" concept (binary vs manual)
3. Create a playbook documenting best practices and anti-patterns
4. Streamline the update-and-review workflow

## Summary of Task

Implement and document features for manual/review-based testing:

| Phase | Feature | Value | Complexity |
|-------|---------|-------|------------|
| I | Documentation: Testing Playbook | Establish patterns and anti-patterns | Low |
| II | `--review` mode | Run + update + show diffs (no pass/fail) | Low |
| III | `validation` frontmatter option | Per-file binary vs manual designation | Low |
| IV | Review annotations in test files | Document expected behavior for reviewers | Low |
| V | CI integration patterns | GitHub Actions examples for manual review | Low |
| VI | Comparison and evaluation modes | Quality evals, side-by-side, script/LLM evaluators | Medium |

## Backward Compatibility

| Area | Compatibility Level | Notes |
|------|---------------------|-------|
| CLI behavior | Additive | New `--review`, `--evaluate` flags, existing unchanged |
| Config schema | Additive | New optional `validation`, `comparison`, `evaluator` fields |
| Test file syntax | Additive | New optional annotations (`REVIEW`, `EVALUATE`) |
| Exit codes | Unchanged | Default behavior preserved |
| Validation modes | Backward compatible | `binary` remains default, new modes opt-in |

---

## Phase I: Testing Playbook Documentation

### Overview

Create comprehensive documentation covering tryscript use cases, workflows, best
practices, and anti-patterns. This establishes patterns before adding features.

### Document Structure

Create `packages/tryscript/docs/playbook.md`:

```markdown
# Tryscript Testing Playbook

A guide to effective CLI testing patterns and workflows.

## Use Cases

### 1. Deterministic CLI Testing (Default)

**Best for**: CLIs with predictable outputs, version strings, help text, file
operations.

**Characteristics**:
- Same input → same output (minus timestamps, paths)
- Failures indicate regressions
- Fully automatable in CI

**Example**:
````yaml
---
sandbox: true
path: [$TRYSCRIPT_PACKAGE_BIN]
---

# Test: Version command

```console
$ my-cli --version
my-cli v[..]
? 0
```
````

**Elision patterns for variability**:
```console
$ my-cli build
Build started at [..]
...
Build completed in [..]ms
? 0
```

### 2. Manual Review Testing

**Best for**: Any output that varies and requires human judgment—LLM responses,
generated content, complex formatting, or quality-sensitive output.

**Characteristics**:
- Outputs vary between runs
- "Correct" is subjective (quality, tone, completeness)
- Human review needed to assess acceptability

**Workflow**:
```bash
# Capture current behavior
pnpm test:cli:update

# Review the outputs manually
git diff tests/

# If acceptable, commit as new baseline
git add tests/ && git commit -m "Update test baselines"
```

**Example**: Test file captures output for human review. The reviewer checks
that the summary is 2-3 sentences and captures the main points.

````yaml
---
validation: manual
---

# Test: Summarization quality

```console
$ summarize-cli article.txt
...
? 0
```
````

**Other manual review examples**: Web scraping results, visual/UX formatting,
interactive wizards—any output where human judgment determines correctness.

### 3. Quality Evaluation Testing

**Best for**: Search engines, recommendation systems, ranking algorithms, or any
system where outputs vary but quality should remain consistent.

**Key insight**: The comparison isn't a diff—it's an evaluation. Previous and
current results might both be "correct" but differ. The goal is ensuring quality
hasn't regressed.

**Example**: Search results may change order, but should maintain relevance.

````yaml
---
validation: evaluation
comparison: side-by-side
---

# Test: Search relevance

```console
$ search-cli query "rust async programming"
...
? 0
```
````

**Evaluation strategies**:
- **Human review**: Side-by-side comparison of previous vs current output
- **Script-based**: External script returns a quality score
- **LLM-based** (future): LLM evaluates against criteria

**When to use evaluation vs manual vs binary**:

| Scenario | Mode | Reasoning |
|----------|------|-----------|
| CLI version output | binary | Exact match expected |
| LLM chat response | manual | Varies, human review |
| Search results quality | evaluation | Quality comparison, not diff |
| Recommendation relevance | evaluation | Metrics-based comparison |
| Generated code | evaluation | Functional equivalence, not textual |

## Workflows

### Package.json Test Scripts

Configure tryscript in your package.json for consistent test execution:

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:cli",
    "test:unit": "vitest run",
    "test:cli": "tryscript run",
    "test:cli:update": "tryscript run --update",
    "test:review": "tryscript run tests/manual/ --review"
  }
}
```

**Usage**:

```bash
pnpm test:cli              # Run all tryscript tests
pnpm test:cli:update       # Update baselines after intentional changes
pnpm test:review           # Review manual tests with diffs
```

CI systems simply call these scripts—no CI-specific test logic needed.

### Development Workflow

```bash
# Run tests during development
pnpm test:cli

# After intentional output changes, update baselines
pnpm test:cli:update
git diff                   # Review what changed
git add tests/ && git commit -m "update test baselines"

# For manual/evaluation tests
pnpm test:review           # Shows diffs for human review
```

## Best Practices

### DO: Use Elision Patterns Liberally

```console
# Good: Handles variable content
$ cli build
Build started at [..]
...
Completed in [..]ms
? 0

# Bad: Brittle, breaks on any change
$ cli build
Build started at 2024-01-15T10:30:00Z
Processing file1.ts
Processing file2.ts
Completed in 234ms
? 0
```

### DO: Separate Deterministic and Manual Tests

```
tests/
├── cli.tryscript.md           # Automated, run in CI
├── help.tryscript.md          # Automated
└── manual/
    ├── llm-responses.tryscript.md   # Requires review
    └── visual-output.tryscript.md   # Requires review
```

### DO: Document Review Criteria

For manual tests, describe what the reviewer should check (in comments, test
title, or documentation). Example: "Error should mention the invalid flag and
suggest alternatives."

### DON'T: Use Manual Tests for Deterministic Behavior

If output can be matched with elision patterns, use automated testing instead
of `validation: manual`.

### DON'T: Ignore Failing Manual Tests

Manual tests should still run and show differences:

```bash
# Run manual tests to see what changed
tryscript run tests/manual/ --update

# Review every change, don't blindly commit
git diff tests/manual/
```

### DON'T: Put Secrets in Test Files

Even manual tests shouldn't contain real credentials:

```yaml
# Bad
env:
  API_KEY: "sk-live-abc123..."

# Good
env:
  API_KEY: "test-key"
  # Or use environment variable from CI
```

## Anti-Patterns

### Anti-Pattern: Empty Expected Output

```console
# Bad: Accepts any output
$ cli do-something
? 0

# Better: At least verify structure
$ cli do-something
...
Done
? 0
```

### Anti-Pattern: Overly Broad Elision

```console
# Bad: Matches anything
$ cli complex-operation
...
? 0

# Better: Pin stable parts
$ cli complex-operation
Starting complex operation...
...
Operation completed successfully.
? 0
```

### Anti-Pattern: Testing Implementation Details

```console
# Bad: Tests internal log format
$ cli build
[DEBUG] Loading config from ./config.json
[DEBUG] Found 3 source files
[DEBUG] Compiling file 1/3...

# Better: Test user-facing output
$ cli build
Building project...
...
Build complete.
? 0
```

### Anti-Pattern: Flaky Time-Dependent Tests

```console
# Bad: Depends on execution speed
$ cli slow-operation
Completed in 1.234s
? 0

# Good: Use elision
$ cli slow-operation
Completed in [..]
? 0
```
```

### Files to Create

| File | Description |
|------|-------------|
| `packages/tryscript/docs/playbook.md` | Main playbook document (above) |

### Acceptance Criteria

- [ ] Playbook covers all major use cases
- [ ] Each use case has concrete examples
- [ ] Best practices are actionable
- [ ] Anti-patterns show both bad and good alternatives
- [ ] CI workflow examples are copy-pasteable

---

## Phase II: `--review` Mode

### Overview

Add a `--review` flag that combines update mode with explicit diff display, exiting
successfully to indicate "review needed" rather than "tests passed."

### CLI Changes

```bash
# New flag
tryscript run tests/manual/*.tryscript.md --review

# Behavior:
# 1. Run all tests
# 2. Update expected outputs with actual
# 3. Show unified diff of all changes
# 4. Exit 0 (review mode doesn't "fail")
```

### Implementation

**New option** in `run.ts`:

```typescript
interface RunOptions {
  // ... existing options ...
  review?: boolean;  // New: run + update + show diff
}

.option('--review', 'Run tests, update outputs, show diff for review')
```

**Behavior**:

```typescript
if (opts.review) {
  // Force update mode
  opts.update = true;

  // After running, show cumulative diff
  for (const fileResult of fileResults) {
    if (!fileResult.passed) {
      const { updated, diff } = await updateTestFile(fileResult.file, fileResult.results);
      if (updated && diff) {
        console.log(colors.header(`\n${fileResult.file.path}`));
        console.log(diff);
      }
    }
  }

  // Exit 0 in review mode
  process.exit(0);
}
```

### Output Format

```
$ tryscript run tests/manual/ --review

tests/manual/llm-responses.tryscript.md
  ● Updated: Test: Summarization (output changed)
  ● Updated: Test: Translation (output changed)
  ✓ Test: Simple echo

Diff:

--- tests/manual/llm-responses.tryscript.md
+++ tests/manual/llm-responses.tryscript.md (updated)
@@ -10,7 +10,7 @@
 ```console
 $ ai summarize text.txt
-The text discusses AI ethics and safety concerns...
+The text explores considerations around AI development...
 ? 0
 ```

Review complete. 2 tests updated.
```

### Acceptance Criteria

- [ ] `--review` implies `--update`
- [ ] Shows unified diff of all changes
- [ ] Exits 0 (not failure)
- [ ] Works with `--filter` to review subset
- [ ] Clear output indicating review mode

---

## Phase III: `validation` Frontmatter Option

### Overview

Add a `validation` field to test file frontmatter to declare whether a test file
should be treated as binary (automated pass/fail) or manual (requires review).

### Syntax

```yaml
---
validation: binary      # Default: standard pass/fail (omitting is same as binary)
---

---
validation: manual      # Outputs are expected to vary; review needed
---

---
validation: evaluation  # Outputs vary; quality comparison needed (see Phase VI)
---
```

### Behavior Changes

| Mode | Default run | `--review` run | CI behavior |
|------|-------------|----------------|-------------|
| `binary` | Pass/fail | Pass/fail | Block on failure |
| `manual` | Warn if changed | Update + show diff | Create review PR |
| `evaluation` | Run evaluator | Show comparison | Check score threshold |

**Default run with manual files**:

```bash
$ tryscript run

tests/cli.tryscript.md
  ✓ Test: Version
  ✓ Test: Help

tests/manual/llm.tryscript.md (manual validation)
  ⚠ Test: Summary (output differs - review needed)
  ✓ Test: Simple prompt

2 passed, 0 failed, 1 needs review
```

### Implementation

**Schema** (`types.ts`):

```typescript
export const TestConfigSchema = z.object({
  // ... existing fields ...
  validation: z.enum(['binary', 'manual']).optional().default('binary'),
});
```

**Runner changes**:

```typescript
// When validation: manual, don't count differences as failures
if (config.validation === 'manual' && !result.passed) {
  result.needsReview = true;
  result.passed = true;  // Don't fail the test
}
```

**Summary reporting**:

```typescript
interface TestRunSummary {
  // ... existing fields ...
  totalNeedsReview: number;
}
```

### Acceptance Criteria

- [ ] `validation: binary` behaves as current default
- [ ] `validation: manual` doesn't fail on output differences
- [ ] Summary shows "needs review" count
- [ ] Exit code reflects only binary test failures
- [ ] `--review` mode works with both validation types

---

## Phase IV: Review Guidance

### Overview

Test files can include guidance for reviewers using standard markdown—headings,
comments, or descriptions above test blocks. No special syntax needed.

**Example**: Use the test title or markdown comments to describe what to verify.

````md
# Test: Error message quality

Verify the error mentions the invalid flag and suggests alternatives.

```console
$ my-cli --invalid-flag
...
? 1
```
````

### Acceptance Criteria

- [ ] Documentation recommends patterns for review guidance
- [ ] No special syntax required—standard markdown works

---

## Phase V: CI Integration Patterns

### Overview

Document patterns for running tryscript tests in CI. The key principle: **test
logic lives in package.json scripts, not CI configuration**. CI simply invokes
the same scripts developers use locally.

### Package.json Scripts

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:cli",
    "test:cli": "tryscript run",
    "test:cli:binary": "tryscript run --filter-validation binary",
    "test:cli:review": "tryscript run --filter-validation manual,evaluation --review"
  }
}
```

### CI Configuration

CI calls the package.json scripts:

```yaml
# Any CI system (GitHub Actions, GitLab, CircleCI, etc.)
- run: pnpm install
- run: pnpm build
- run: pnpm test:cli:binary   # Automated tests only
```

For manual/evaluation tests, run review locally or as a scheduled job that
opens PRs for human review.

### Acceptance Criteria

- [ ] Package.json script examples documented
- [ ] `--filter-validation` flag works with multiple values
- [ ] CI-agnostic examples provided

---

## Phase VI: Comparison and Evaluation Modes

### Overview

Extend the comparison system beyond simple diffs to support quality evaluation
workflows where outputs may legitimately differ but should maintain comparable
quality. This addresses use cases like search engines, recommendation systems,
and any scenario where "different but equally good" is a valid outcome.

### Motivation

The current diff-based approach assumes there's one correct output. But for many
systems:

- **Search engines**: Different result orderings may be equally valid
- **Recommendations**: Various items could be appropriate recommendations
- **ML/AI outputs**: Responses vary but quality should be consistent
- **Generated content**: Multiple valid outputs exist for the same input

The question isn't "Did the output change?" but "Is the output still good?"

### Comparison Modes

Add a `comparison` option to control how outputs are presented for review:

```yaml
---
validation: evaluation
comparison: diff        # Default: unified diff view
comparison: side-by-side  # Show previous and current together
comparison: baseline    # Show current with baseline metadata
---
```

**`diff` (default)**: Standard unified diff format.

**`side-by-side`**: Display previous and current output in parallel:

```
$ tryscript run tests/search.tryscript.md --review

Test: Search relevance
┌─────────────────────────────┬─────────────────────────────┐
│ Previous (baseline)         │ Current                     │
├─────────────────────────────┼─────────────────────────────┤
│ 1. Rust async/await guide   │ 1. Async Rust programming   │
│ 2. Tokio runtime tutorial   │ 2. Rust async/await guide   │
│ 3. Async Rust patterns      │ 3. Tokio runtime tutorial   │
│ 4. ...                      │ 4. ...                      │
└─────────────────────────────┴─────────────────────────────┘
Evaluate: Are these results comparable quality?
```

**`baseline`**: Show current output with metadata about the baseline:

```
$ tryscript run tests/recommendations.tryscript.md --review

Test: Product recommendations
Baseline captured: 2026-01-15 (12 items, avg relevance 0.87)

Current output:
1. Blue Widget (relevance: 0.92)
2. Premium Gadget (relevance: 0.88)
...

Compare against baseline to verify quality maintained.
```

### Evaluator Types

Add an `evaluator` option to specify how quality should be assessed:

```yaml
---
validation: evaluation
evaluator: human        # Default: human reviews the comparison
evaluator: script       # Run evaluation script
evaluator: llm          # Use LLM to evaluate quality
---
```

#### Human Evaluation (default)

The current review workflow with enhanced comparison display.

#### Script Evaluation

Run an external script that scores the output:

```yaml
---
validation: evaluation
evaluator:
  type: script
  command: ./scripts/evaluate-search.py
  threshold: 0.80
  pass_baseline: true  # Pass baseline file path as second arg
---
```

Script receives:
- `$1`: Path to file containing current output
- `$2`: Path to file containing baseline output (if `pass_baseline: true`)

Script outputs JSON with score and optional details:

```json
{
  "score": 0.85,
  "passed": true,
  "details": {
    "precision": 0.90,
    "recall": 0.80,
    "relevance": 0.85
  },
  "notes": "Quality maintained despite result ordering changes"
}
```

#### LLM Evaluation (Future)

Use an LLM to evaluate quality against criteria:

```yaml
---
validation: evaluation
evaluator:
  type: llm
  model: gpt-4  # or claude, etc.
  criteria:
    - Results are relevant to the query
    - Top results contain query terms
    - No obvious spam or low-quality items
  threshold: 0.80
---
```

**Note**: LLM evaluation is a future feature. Initial implementation focuses
on human and script evaluators.

### Schema Changes

**Updated `validation` enum**:

```typescript
export const TestConfigSchema = z.object({
  // ... existing fields ...
  validation: z.enum(['binary', 'manual', 'evaluation']).optional().default('binary'),
  comparison: z.enum(['diff', 'side-by-side', 'baseline']).optional().default('diff'),
  evaluator: z.union([
    z.literal('human'),
    z.object({
      type: z.literal('script'),
      command: z.string(),
      threshold: z.number().optional(),
      pass_baseline: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('llm'),
      model: z.string().optional(),
      criteria: z.array(z.string()),
      threshold: z.number().optional(),
    }),
  ]).optional().default('human'),
});
```

### Behavior Summary

| Validation | Comparison | Evaluator | Behavior |
|------------|------------|-----------|----------|
| binary | diff | - | Exact match required |
| manual | diff | human | Show diff, human reviews |
| evaluation | diff | human | Show diff, human evaluates quality |
| evaluation | side-by-side | human | Show side-by-side, human evaluates |
| evaluation | diff | script | Run script, check threshold |
| evaluation | diff | llm | Run LLM eval, check threshold |

### CLI Integration

```bash
# Run with evaluation mode
tryscript run tests/search.tryscript.md --review

# Override comparison mode
tryscript run tests/search.tryscript.md --review --comparison side-by-side

# Run script evaluator and get results
tryscript run tests/search.tryscript.md --evaluate
# Outputs: PASS (score: 0.87) or FAIL (score: 0.65, threshold: 0.80)

# Filter by validation type
tryscript run --filter-validation evaluation --review
```

### Example: Search Engine Testing

````yaml
---
validation: evaluation
comparison: side-by-side
evaluator:
  type: script
  command: ./scripts/search-quality-eval.py
  threshold: 0.75
---

# Test: Search relevance

```console
$ search-cli "rust async programming"
...
? 0
```
````

### Acceptance Criteria

- [ ] `validation: evaluation` mode implemented
- [ ] `comparison: side-by-side` displays previous/current together
- [ ] `comparison: baseline` shows current with baseline metadata
- [ ] Script evaluator runs external command
- [ ] Script evaluator respects threshold
- [ ] Evaluation scores reported in summary
- [ ] `--filter-validation evaluation` works
- [ ] Documentation updated with evaluation examples

---

## Implementation Order

| Phase | Feature | Dependencies | Priority |
|-------|---------|--------------|----------|
| I | Playbook documentation | None | High |
| II | `--review` mode | None | High |
| III | `validation` option | Playbook for context | Medium |
| IV | Review annotations | III | Low |
| V | CI patterns | I, II | Medium |
| VI | Comparison/evaluation modes | III | Medium |

**Recommended approach**: Implement Phase I first to establish patterns, then II
for the core workflow improvement, then III-V as refinements. Phase VI extends
the validation system and can be implemented after the core manual testing
workflow is established.

---

## Outstanding Questions

1. **Exit code in review mode**: Should `--review` always exit 0, or exit with
   a distinct code (e.g., 2) to indicate "changes for review"?
   - **Recommendation**: Exit 0. Review mode is informational, not a gate.

2. **Mixing binary and manual in one file**: Should this be allowed?
   - **Recommendation**: Validation is per-file. Mixed files should be split.

3. **Default for manual validation**: When `validation: manual`, should
   `--update` be implicit?
   - **Recommendation**: No. Explicit is better. `--review` handles this.

4. **Integration with `--fail-fast`**: How should `--fail-fast` work with
   manual tests?
   - **Recommendation**: `--fail-fast` only applies to binary tests.

5. **Filter syntax**: `--filter-validation` or `--validation-filter`?
   - **Recommendation**: `--filter-validation manual|binary|evaluation` for consistency.

6. **Evaluation score persistence**: Should evaluation scores be stored anywhere?
   - **Recommendation**: Include in test output file as comment or metadata.
     Could add `<!-- LAST_SCORE: 0.87, 2026-01-31 -->` to track trends.

7. **Baseline storage for evaluation mode**: Where should baselines live?
   - **Recommendation**: Same as current - in the test file itself. The
     "expected output" block serves as the baseline for comparison.

8. **Side-by-side terminal width**: How to handle wide outputs?
   - **Recommendation**: Truncate with `...`, offer `--full` flag for complete
     output, or write to temp files and show paths.

9. **LLM evaluator cost/latency**: Running LLM for every test could be expensive.
   - **Recommendation**: LLM evaluation is opt-in and likely for subset of tests.
     Consider caching, batching, or CI-only evaluation modes.

10. **Evaluation threshold semantics**: What does the threshold mean?
    - **Recommendation**: Score >= threshold means pass. For script evaluators,
      exit code 0 = pass, non-zero = fail. Threshold is for score-based checks.
