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
```yaml
---
sandbox: true
path: [$TRYSCRIPT_PACKAGE_BIN]
---

# Test: Version command

```console
$ my-cli --version
my-cli v1.0.0
? 0
```

# Test: Help output

```console
$ my-cli --help
Usage: my-cli [command] [options]

Commands:
  init    Initialize a new project
  build   Build the project
...
? 0
```
```

**Elision patterns for variability**:
```console
$ my-cli build
Build started at [..]
...
Build completed in [..]ms
? 0
```

### 2. LLM/AI Response Testing

**Best for**: Testing CLI wrappers around LLMs, AI assistants, chat interfaces.

**Characteristics**:
- Outputs vary between runs
- "Correct" is subjective (tone, completeness, accuracy)
- Human review needed for quality assessment

**Workflow**:
```bash
# Capture current behavior
tryscript run tests/llm.tryscript.md --update

# Review the outputs manually
git diff tests/llm.tryscript.md

# If acceptable, commit as new baseline
git add tests/llm.tryscript.md
git commit -m "Update LLM response baselines"
```

**Example with review annotations**:
```yaml
---
validation: manual
---

# Test: Summarization quality

<!-- REVIEW: Output should be 2-3 sentences, capture main points -->

```console
$ ai-cli summarize article.txt
[.. summary text varies ..]
? 0
```
```

### 3. Web Scraping / Search Results

**Best for**: CLIs that fetch web content, search APIs, live data.

**Characteristics**:
- Content changes over time
- Structure may be stable even if content varies
- May need to verify "something reasonable" returned

**Pattern - Structure validation**:
```console
$ web-cli search "nodejs tutorials"
Results for "nodejs tutorials":
...
Found [..] results
? 0
```

**Pattern - Snapshot for reference**:
```yaml
---
validation: manual
---

# Test: Search returns results

<!-- REVIEW: Should return 5+ relevant results with titles and URLs -->

```console
$ web-cli search "rust programming"
[.. search results vary ..]
? 0
```
```

### 4. Visual/UX Output Testing

**Best for**: CLIs with formatted output, progress bars, tables, colors.

**Characteristics**:
- Visual correctness hard to assert automatically
- Screenshots or terminal recordings may supplement
- Alignment, formatting, color choices need human eye

**Pattern**:
```yaml
---
validation: manual
env:
  FORCE_COLOR: "1"  # Enable colors for review
---

# Test: Table formatting

<!-- REVIEW: Columns should be aligned, headers bold -->

```console
$ report-cli show --format table
[.. formatted table output ..]
? 0
```
```

### 5. Interactive/Multi-step Workflows

**Best for**: CLIs with prompts, wizards, complex state.

**Characteristics**:
- Output depends on timing, user choices
- May need fixture setup
- Often better tested with unit tests + limited E2E

**Pattern - Scripted input**:
```console
$ echo -e "project-name\ny\n" | wizard-cli init
? Project name: project-name
? Confirm? (y/n): y
Created project-name/
? 0
```

### 6. Quality Evaluation Testing

**Best for**: Search engines, recommendation systems, ranking algorithms, ML model
outputs, content generation systems.

**Characteristics**:
- Outputs vary between runs but should maintain similar quality
- "Correct" isn't about exact matching but quality metrics
- Evaluation requires comparing quality, not just content
- May need scoring (precision, recall, relevance) rather than pass/fail

**Key insight**: The comparison isn't a diff—it's an evaluation. Previous results
and current results might both be "correct" but differ. The goal is to ensure
quality hasn't regressed.

**Pattern - Search quality evaluation**:
```yaml
---
validation: evaluation
comparison: side-by-side
---

# Test: Search relevance

<!--
EVALUATE:
- Results should be relevant to query
- Top 3 results should contain query terms
- No spam or low-quality results
- Compare: Are new results as good or better than baseline?
-->

```console
$ search-cli query "rust async programming"
[.. search results vary ..]
? 0
```
```

**Pattern - Recommendation quality**:
```yaml
---
validation: evaluation
---

# Test: Product recommendations

<!--
EVALUATE:
- Recommendations should match user preferences
- Diversity: not all same category
- Relevance score should be >= baseline average
-->

```console
$ recommend-cli --user test-user-123
[.. recommendations vary ..]
? 0
```
```

**Pattern - LLM response quality**:
```yaml
---
validation: evaluation
evaluator: llm  # or: script, human
---

# Test: Summary quality maintains standards

<!--
EVALUATE:
- Summary captures main points (precision)
- No critical information omitted (recall)
- Factual accuracy maintained
- Tone and style appropriate

COMPARISON: Both old and new outputs may be valid. Evaluate whether
new output is at least as good as previous baseline.
-->

```console
$ summarize-cli article.txt
[.. summary varies ..]
? 0
```
```

**Evaluation strategies**:

1. **Side-by-side comparison**: Display previous and current output together
   for human review, rather than a diff.

2. **Script-based scoring**: Run an evaluation script that produces metrics:
   ```yaml
   evaluator:
     type: script
     command: ./scripts/eval-search-quality.sh
     threshold: 0.85  # Minimum score to pass
   ```

3. **LLM-based evaluation**: Use an LLM to assess quality:
   ```yaml
   evaluator:
     type: llm
     criteria:
       - relevance
       - accuracy
       - completeness
   ```

4. **Human judgment with criteria**: Structured review with explicit criteria
   (as shown in EVALUATE comments above).

**When to use evaluation vs manual vs binary**:

| Scenario | Mode | Reasoning |
|----------|------|-----------|
| CLI version output | binary | Exact match expected |
| LLM chat response | manual | Varies, human review |
| Search results quality | evaluation | Quality comparison, not diff |
| Recommendation relevance | evaluation | Metrics-based comparison |
| Generated code | evaluation | Functional equivalence, not textual |

## Workflows

### Automated Testing (CI)

Standard tryscript in CI pipelines:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npx tryscript run
```

### Manual Review Testing

For tests requiring human judgment:

```yaml
# .github/workflows/manual-review.yml
jobs:
  update-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build

      # Update baselines and create PR for review
      - run: npx tryscript run tests/manual/*.tryscript.md --update

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet tests/manual/; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Create review PR
        if: steps.changes.outputs.changed == 'true'
        run: |
          git checkout -b update-baselines-$(date +%Y%m%d)
          git add tests/manual/
          git commit -m "chore: update manual test baselines for review"
          gh pr create --title "Review: Updated test baselines" \
            --body "These test outputs have changed. Please review."
```

### Development/Exploratory Testing

When building new features:

```bash
# Create a scratch test file
cat > tests/scratch.tryscript.md << 'EOF'
---
sandbox: true
---

# Exploring new feature

```console
$ my-cli new-command --help
```
EOF

# Run and capture output
tryscript run tests/scratch.tryscript.md --update

# Iterate until output looks right
# Then move to permanent test file
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

```yaml
---
validation: manual
---

# Test: Error message quality

<!--
REVIEW CRITERIA:
- Error should mention the invalid flag name
- Should suggest valid alternatives
- Tone should be helpful, not accusatory
-->

```console
$ my-cli --invlaid-flag
[.. error message ..]
? 1
```
```

### DON'T: Use Manual Tests for Deterministic Behavior

If output can be matched with patterns, use automated testing:

```yaml
# Bad: Marked manual but could be automated
---
validation: manual
---

```console
$ cli --version
v1.2.3
? 0
```

# Good: Automated test with pattern
```console
$ cli --version
v[..]
? 0
```
```

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

## Phase IV: Review Annotations

### Overview

Support HTML comments in test files that provide review guidance. These are
informational only - they help reviewers understand what to look for.

### Syntax

```yaml
---
validation: manual
---

# Test: AI Response Quality

<!-- REVIEW: Response should be helpful and accurate -->
<!-- REVIEW: Tone should be professional -->
<!-- REVIEW: Should not hallucinate facts -->

```console
$ ai-cli ask "What is the capital of France?"
[.. AI response ..]
? 0
```
```

### Display in Review Mode

```
$ tryscript run tests/ai.tryscript.md --review

tests/ai.tryscript.md (manual validation)
  ● Test: AI Response Quality
    Review criteria:
    - Response should be helpful and accurate
    - Tone should be professional
    - Should not hallucinate facts

    Diff:
    - Paris is the capital of France, known for...
    + Paris is the capital and largest city of France...
```

### Implementation

**Parser changes** (`parser.ts`):

```typescript
interface TestBlock {
  // ... existing fields ...
  reviewCriteria?: string[];  // Extracted from <!-- REVIEW: ... --> comments
}

// In parseTestFile:
const reviewPattern = /<!--\s*REVIEW:\s*(.+?)\s*-->/g;
```

### Acceptance Criteria

- [ ] `<!-- REVIEW: text -->` comments are parsed
- [ ] Multiple REVIEW comments become array
- [ ] Displayed in `--review` mode output
- [ ] Ignored in normal binary run
- [ ] Works with or without `validation: manual`

---

## Phase V: CI Integration Patterns

### Overview

Document and provide examples for integrating manual tests into CI/CD workflows.

### GitHub Actions Workflow

**`.github/workflows/manual-tests.yml`**:

```yaml
name: Manual Test Review

on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  update-manual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npm ci
      - run: npm run build

      - name: Run manual tests in review mode
        run: npx tryscript run 'tests/manual/**/*.tryscript.md' --review
        continue-on-error: true

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet tests/manual/; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
            git diff tests/manual/ > /tmp/changes.diff
          fi

      - name: Create Pull Request
        if: steps.changes.outputs.changed == 'true'
        uses: peter-evans/create-pull-request@v5
        with:
          branch: update-manual-tests
          title: 'chore: Update manual test baselines'
          body: |
            ## Manual Test Baseline Updates

            The following manual tests have updated outputs that require review:

            ```diff
            $(cat /tmp/changes.diff)
            ```

            Please review the changes to ensure they are acceptable.
          commit-message: 'chore: update manual test baselines'
          labels: |
            needs-review
            tests
```

### Filtering Manual vs Binary Tests

```yaml
# Run only binary tests (default CI)
- run: npx tryscript run --filter-validation binary

# Run only manual tests for review
- run: npx tryscript run --filter-validation manual --review
```

### Acceptance Criteria

- [ ] GitHub Actions example is complete and tested
- [ ] Example creates PR with diff
- [ ] Documentation covers common CI platforms
- [ ] Filter by validation mode works

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

### Example Workflow: Search Engine Testing

```yaml
---
sandbox: true
validation: evaluation
comparison: side-by-side
evaluator:
  type: script
  command: ./scripts/search-quality-eval.py
  threshold: 0.75
  pass_baseline: true
---

# Test: Search relevance for programming queries

<!--
EVALUATE:
- Results should be relevant to query
- Top 3 results should contain query terms or synonyms
- Result diversity: not all from same source
- No broken links or error responses

COMPARISON NOTES:
Result ordering may differ. Evaluate based on overall quality
of the result set, not exact match of positions.
-->

```console
$ search-cli "rust async programming tutorial"
[.. results ..]
? 0
```

# Test: Search handles edge cases

```console
$ search-cli ""
No query provided. Please enter a search term.
? 1
```
```

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
