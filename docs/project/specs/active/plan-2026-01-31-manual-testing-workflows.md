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
- **Quality evaluation (evals)**: Search relevance, ranking quality, precision/recall metrics
- **Exploratory testing**: New feature development, debugging sessions
- **Documentation verification**: Ensuring examples still run correctly

### Beyond Simple Diffs

The current model assumes comparison via text diff, but many evaluation scenarios
need richer comparison methods:

- **Side-by-side comparison**: View previous and current outputs together
- **Metric-based evaluation**: Precision, recall, relevance scores
- **LLM-assisted evaluation**: Use another model to judge quality/similarity
- **Custom evaluators**: Scripts that produce comparison reports

These scenarios require a generalization beyond "diff the outputs" to "evaluate
the outputs" with configurable comparison strategies.

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

## Design Philosophy

### Tryscript as "Jupyter Notebooks for CLI Testing"

A useful mental model: tryscript files are like Jupyter notebooks for CLI testing.

| Jupyter Notebooks | Tryscript Files |
|-------------------|-----------------|
| Run code cells, capture outputs | Run commands, capture outputs |
| Outputs stored in `.ipynb` | Outputs stored in `.tryscript.md` |
| Rerun to update outputs | `--update` to refresh outputs |
| Visual inspection of results | `git diff` to review changes |
| Share notebooks for collaboration | Commit files to git for review |

Both provide **structured, reproducible, reviewable** execution with captured outputs.

### Principles

1. **Build on existing tools**: `tryscript run --update` + `git diff` already works.
   Minimize new features; maximize reuse.

2. **Everything is a file diff**: All comparison ultimately reduces to diffing the
   tryscript markdown file before and after. Even "side-by-side" is just showing
   the old and new outputs.

3. **Non-interactive, agent-friendly**: All workflows must work from command line
   without interactive prompts. Agents should be able to run, inspect, and review.

4. **Prose is documentation**: Review criteria are just regular markdown text in
   the test file. No special syntax needed.

5. **Simple format, flexible workflows**: Keep the tryscript format unchanged.
   Different workflows are achieved through CLI options and shell composition.

### The Core Workflow (Already Works Today)

```bash
# 1. Run tests with update mode
tryscript run tests/evals/*.tryscript.md --update

# 2. Review changes with standard git diff
git diff tests/evals/

# 3. Accept or reject
git add tests/evals/ && git commit -m "Update baselines"
# or
git checkout -- tests/evals/  # Reject changes
```

This workflow is already sufficient for most manual testing needs. The question
is: what minimal enhancements would make it more streamlined?

## Summary of Task

Implement and document features for manual/review-based testing:

| Phase | Feature | Value | Complexity |
|-------|---------|-------|------------|
| I | Documentation: Testing Playbook | Establish patterns and anti-patterns | Low |
| II | `--review` mode | Run + update + show diffs (no pass/fail) | Low |
| III | `validation` frontmatter option | Per-file binary vs manual designation | Low |
| IV | Review annotations in test files | Document expected behavior for reviewers | Low |
| V | CI integration patterns | GitHub Actions examples for manual review | Low |
| VI | Comparison modes | Side-by-side, evaluators, LLM-assisted (future) | Medium |

## Backward Compatibility

| Area | Compatibility Level | Notes |
|------|---------------------|-------|
| CLI behavior | Additive | New `--review` flag, existing flags unchanged |
| Config schema | Additive | New optional `validation` field |
| Test file syntax | Additive | New optional annotations |
| Exit codes | Unchanged | Default behavior preserved |

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

**Example with review guidance**:
```yaml
---
validation: manual
---

# Test: Summarization quality

The summary should be 2-3 sentences and capture the main points of the article.

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

Should return 5+ relevant results with titles and URLs.

```console
$ web-cli search "rust programming"
[.. search results vary ..]
? 0
```
```

### 4. Quality Evaluation (Evals)

**Best for**: Search engines, recommendation systems, ranking algorithms, any system
where you need to evaluate quality rather than exact correctness.

**Characteristics**:
- Results may differ but both be "correct"
- Comparison is about quality levels, not exact matches
- May need precision/recall or relevance metrics
- Diff isn't meaningful; side-by-side or scored comparison is better

**Use cases**:
- Search engine result quality over time
- Recommendation relevance evaluation
- Content ranking regression testing
- A/B comparison of algorithm changes

**Pattern - Search quality eval**:
```yaml
---
validation: manual
---

# Eval: Product search relevance

Top 5 results should be relevant to query. No obviously wrong results in top 10.
Compare precision@10 with previous baseline.

```console
$ search-cli query "wireless headphones under $100"
[.. search results ..]
? 0
```
```

**Workflow for evals** (using existing tools):
```bash
# Run evals and capture new baselines
tryscript run tests/evals/*.tryscript.md --update

# Review changes with git diff
git diff tests/evals/

# If acceptable, commit as new baseline
git add tests/evals/ && git commit -m "Update eval baselines"
```

**What the reviewer sees**:
```
Eval: Product search relevance

Previous results:           Current results:
─────────────────           ─────────────────
1. Sony WH-1000XM4          1. Sony WH-1000XM5
2. Bose QC45                2. Bose QC45
3. Apple AirPods Pro        3. JBL Tune 760NC
4. JBL Tune 760NC           4. Apple AirPods Pro
5. Anker Soundcore          5. Anker Soundcore Q20

Observations:
- Top result changed (XM4 → XM5) - expected, newer model
- Positions 3-4 swapped - acceptable
- Overall relevance maintained ✓
```

### 5. Visual/UX Output Testing

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

Columns should be aligned and headers should be bold.

```console
$ report-cli show --format table
[.. formatted table output ..]
? 0
```
```

### 6. Interactive/Multi-step Workflows

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
validation: binary   # Default: standard pass/fail (omitting is same as binary)
---

---
validation: manual   # Outputs are expected to vary; review needed
---
```

### Behavior Changes

| Mode | Default run | `--review` run | CI behavior |
|------|-------------|----------------|-------------|
| `binary` | Pass/fail | Pass/fail | Block on failure |
| `manual` | Warn if changed | Update + show diff | Create review PR |

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

## Phase IV: Review Guidance in Markdown

### Overview

Review criteria are simply written as regular markdown prose in the test file.
No special syntax needed - the markdown description before each test block
naturally serves as documentation for what to look for.

### Example

```yaml
---
validation: manual
---

# Test: AI Response Quality

The response should be helpful and accurate. The tone should be professional,
and the model should not hallucinate facts.

```console
$ ai-cli ask "What is the capital of France?"
[.. AI response ..]
? 0
```
```

### Why Plain Markdown

- **Already supported**: Tryscript files are markdown, prose is natural
- **No parsing needed**: No special syntax to implement
- **Readable in any context**: Works in GitHub, editors, `cat`, etc.
- **Self-documenting**: The test file explains itself

### Acceptance Criteria

- [ ] Documentation updated to show prose-based review guidance
- [ ] Examples use plain markdown, not special annotations

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

## Phase VI: Advanced Comparison (Future, If Needed)

### Overview

Most comparison needs are met by `git diff`. This phase documents potential
extensions that could be added if simple diffs prove insufficient.

### Use Standard Tools First

Before adding custom comparison modes, consider:

```bash
# Side-by-side diff (already available)
git diff --word-diff tests/evals/
diff -y old.txt new.txt

# Custom comparison with shell scripts
./scripts/compare-outputs.sh tests/evals/search.tryscript.md

# LLM-assisted review (pipe to Claude, etc.)
git diff tests/evals/ | claude "Review these changes for quality regressions"
```

### Potential Future Extensions

If standard tools prove insufficient, consider:

| Feature | When Needed | Complexity |
|---------|-------------|------------|
| `--diff-format side-by-side` | If git diff isn't readable enough | Low |
| `--post-update-hook ./script.sh` | Run custom script after update | Low |
| Built-in LLM comparison | If manual review is too slow | High |

### Philosophy

> "The simplest thing that could possibly work" - Ward Cunningham

Start with `tryscript run --update && git diff`. Add features only when the
simple approach proves inadequate for real use cases.

---

## Implementation Order

| Phase | Feature | Dependencies | Priority |
|-------|---------|--------------|----------|
| I | Playbook documentation | None | High |
| II | `--review` mode | None | High |
| III | `validation` option | Playbook for context | Medium |
| IV | Review guidance (prose) | None | Low (just documentation) |
| V | CI patterns | I, II | Medium |
| VI | Advanced comparison | Proven need | Low (future, maybe never) |

**Recommended approach**: Implement Phase I first to establish patterns, then II
for the core workflow improvement. Validate that the simple approach works before
adding complexity. Phase VI may never be needed.

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
   - **Recommendation**: `--filter-validation manual|binary` for consistency.

6. **Is `validation: manual` even needed?**: Could we just use file organization
   (e.g., `tests/evals/` vs `tests/`) instead of frontmatter?
   - **Recommendation**: Start with file organization, add frontmatter only if needed.
