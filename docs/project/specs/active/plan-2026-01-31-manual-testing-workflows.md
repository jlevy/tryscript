# Plan Spec: Manual Testing Workflows and Validation Modes

**Status**: PLANNING

## Purpose

This plan designs features to support "manual" test scripts - tests that facilitate
human or agent review rather than strict pass/fail automation. This addresses use
cases where outputs are inherently variable or require subjective evaluation.

## Background

### Current Tryscript Model

Tryscript is designed as an automated golden test framework:

1. Run commands, capture outputs
2. Compare against expected golden outputs
3. Pass if matches (with elision patterns), fail otherwise
4. Exit with non-zero status on any failure

This works well for deterministic CLIs but breaks down for:

- **Variable outputs**: Search results, generated content, timestamps
- **Subjective evaluation**: Visual appearance, formatting quality
- **Quality comparisons**: Search relevance, recommendation quality

### The "Update and Review" Workflow

Users have discovered an informal workflow:

```bash
tryscript run tests/manual.tryscript.md --update
git diff tests/manual.tryscript.md
```

This works but has friction—no way to distinguish automated vs manual tests,
and CI doesn't know to pause for review.

## Summary

| Phase | Scope | Complexity |
|-------|-------|------------|
| I | Manual testing workflow: `--review` mode, `validation` frontmatter, playbook | Low |
| II | Quality evaluation: comparison modes, script/LLM evaluators | Medium |

## Backward Compatibility

All changes are additive. Existing behavior unchanged. `binary` validation remains default.

---

## Phase I: Manual Testing Workflow

### Overview

Add support for tests that require human review rather than automated pass/fail.
This includes a `--review` CLI flag, a `validation` frontmatter option, and
documentation of patterns and best practices.

### `--review` Mode

```bash
tryscript run tests/manual/ --review
```

Behavior:
1. Run all tests
2. Update expected outputs with actual
3. Show unified diff of all changes
4. Exit 0 (review mode is informational, not a gate)

### `validation` Frontmatter

```yaml
---
validation: binary   # Default: exact match pass/fail
---

---
validation: manual   # Human review needed; differences don't fail
---
```

| Mode | Default run | `--review` run |
|------|-------------|----------------|
| `binary` | Pass/fail | Pass/fail |
| `manual` | Warn if changed | Update + show diff |

### Package.json Patterns

```json
{
  "scripts": {
    "test:cli": "tryscript run",
    "test:cli:update": "tryscript run --update",
    "test:review": "tryscript run tests/manual/ --review"
  }
}
```

CI runs `pnpm test:cli` for automated tests. Manual tests run locally with
`pnpm test:review`.

### Playbook

Create `packages/tryscript/docs/playbook.md` covering:

**Use cases**:
- Deterministic CLI testing (default)
- Manual review testing (variable outputs)
- Quality evaluation testing (see Phase II)

**Best practices**:
- Use elision patterns liberally (`[..]`, `...`)
- Separate deterministic and manual tests into directories
- Document review criteria in test titles or markdown

**Anti-patterns**:
- Empty expected output
- Overly broad elision
- Testing implementation details
- Using manual mode for deterministic behavior

### Implementation Notes

**Schema** (`types.ts`):
```typescript
validation: z.enum(['binary', 'manual']).optional().default('binary')
```

**Runner**: When `validation: manual`, differences set `needsReview: true`
instead of failing. Summary shows "X needs review" count.

### Acceptance Criteria

- [ ] `--review` flag runs tests, updates outputs, shows diff
- [ ] `--review` exits 0 (informational)
- [ ] `validation: manual` doesn't fail on differences
- [ ] Summary shows "needs review" count separately
- [ ] Playbook documentation created

---

## Phase II: Quality Evaluation Mode

### Overview

Extend manual testing to support quality evaluation workflows where outputs may
differ but quality should remain consistent. The comparison isn't a diff—it's
an evaluation.

**Use cases**: Search engines, recommendation systems, generated content quality.

### `validation: evaluation`

```yaml
---
validation: evaluation
comparison: side-by-side   # or: diff, baseline
---
```

### Comparison Modes

- **`diff`** (default): Standard unified diff
- **`side-by-side`**: Display previous and current output in parallel
- **`baseline`**: Show current with baseline metadata

### Evaluators

```yaml
---
validation: evaluation
evaluator: human           # Default: human reviews comparison
---

---
validation: evaluation
evaluator:
  type: script
  command: ./scripts/eval-quality.py
  threshold: 0.80
---
```

**Script evaluator**: Runs external script, receives current and baseline output
paths, expects JSON response with score.

**LLM evaluator** (future): Use LLM to evaluate against criteria.

### CLI

```bash
tryscript run tests/search.tryscript.md --review
tryscript run tests/search.tryscript.md --review --comparison side-by-side
tryscript run --filter-validation evaluation --review
```

### Acceptance Criteria

- [ ] `validation: evaluation` mode implemented
- [ ] `comparison: side-by-side` displays previous/current together
- [ ] Script evaluator runs external command and checks threshold
- [ ] `--filter-validation` works with multiple values

---

## Outstanding Questions

1. **Exit code in review mode**: Exit 0 (recommendation: yes, informational only)

2. **Mixing binary and manual in one file**: Per-file validation only (split files)

3. **Side-by-side terminal width**: Truncate with `...`, or write to temp files

4. **LLM evaluator cost**: Opt-in, likely for subset of tests only
