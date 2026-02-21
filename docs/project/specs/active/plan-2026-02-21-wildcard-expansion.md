# Plan Spec: Wildcard Expansion and Capture Log

## Purpose

This is a technical design doc for the wildcard expansion feature (`--expand`) and
associated improvements to tryscript's wildcard system. The feature addresses a
fundamental quality problem: agents and humans routinely write golden tests with unnamed
wildcards (`...` and `[..]`) as scaffolding, then never replace them with real assertions,
resulting in tests that verify nothing.

This spec covers three interrelated changes:

1. **`--expand` mode** — a new CLI mode that fills unnamed wildcards with actual output
2. **Wildcard policy config** — governance to prevent wildcard overuse
3. **Capture log** — a YAML sidecar file that records wildcard captures, actual output,
   and execution metadata for debugging and review

## Background

### The Problem: Tests That Verify Nothing

Tryscript's `...` (multi-line) and `[..]` (single-line) elision patterns serve two
conflicting purposes:

1. **Authoring scaffold** — "I don't know the output yet, fill it in later"
2. **Intentional omission** — "This output is genuinely unpredictable, skip it"

There is no way to distinguish which intent a given `...` or `[..]` represents. Test
authors (particularly LLM agents) use them for purpose #1, then never complete the
fill-in step. The result: tests that appear green but verify almost nothing.

Named patterns like `[HASH]`, `[TIMESTAMP]`, `[REMOTE_KEY]` are self-documenting — they
declare *why* a value is dynamic and *what kind* of value is expected. Unnamed wildcards
carry no such intent.

### The `--update` Limitation

The existing `--update` mode replaces the *entire* expected output section when a test
fails. This is too aggressive: if you have a block where some lines are correct and only
a `...` gap needs filling, `--update` discards the lines you already had right. There is
no way to surgically fill just the wildcard gaps.

### Impact on Agent-Written Tests

In practice, LLM agents generating golden tests for CLI tools (e.g., blobsy) produce
files like:

```console
$ blobsy push
...
? 0
```

This test verifies only the exit code. The `...` hides the entire output. With dozens of
such blocks across many test files, the test suite provides a false sense of coverage.

### Related Docs

- [Elision patterns in development.md](../../development.md#elision-patterns)
- [Coverage plan spec](../done/plan-2026-01-04-builtin-coverage-support.md)

## Summary of Task

Implement three features that work together to improve wildcard discipline:

1. **`--expand` flag**: Run all commands and replace unnamed wildcards (`...` and `[..]`)
   with actual matched output, while preserving named patterns (`[HASH]`, `[CWD]`,
   etc.). This is a surgical operation — only the wildcard gaps are filled; surrounding
   literal lines are untouched.

2. **Wildcard policy config**: A `wildcardPolicy` setting (`'allow'` | `'warn'` |
   `'error'`) in the config file and per-file frontmatter that controls whether unnamed
   wildcards are permitted.

3. **Capture log**: An optional YAML file (`--capture-log <path>`) that records, for
   every test block execution: the command, actual output, expected output, actual and
   expected exit codes, and the captured values of all wildcard patterns (both named and
   unnamed).

### Key Principle: Named Patterns Are Sacred

`--expand` never touches named patterns. If a block contains only named patterns (like
`[HASH]`, `[REMOTE_KEY]`, `[CWD]`), expansion changes nothing. The feature only fills
*unnamed* wildcards (`...` and `[..]`).

### The Two-Pass Workflow (Recommended)

This creates a natural authoring workflow:

**Pass 1: Sketch** — Write commands with `...` scaffolding. Focus on getting scenarios
right.

**Pass 2: Expand** — Run `tryscript run --expand`. Every `...` is filled with real
output. The diff shows exactly what was hidden.

**Pass 3: Review and pattern** — Go through expanded output. Replace genuinely unstable
values with named patterns (`[HASH]`, `[TIMESTAMP]`, etc.). Leave everything else
literal.

**Pass 4: Commit** — Full output coverage with only named patterns for dynamic fields.

### Before/After Examples

#### Simple expansion

Before (scaffold):
```console
$ blobsy push
...
? 0
```

After `--expand`:
```console
$ blobsy push
Pushing 2 files...
  data/model.bin (13 B) - pushed
  data/dataset.csv (12 B) - pushed
Done: 2 pushed.
? 0
```

#### Mixed block (surgical gap-filling)

Before:
```console
$ blobsy push data/model.bin
Pushing 1 file...
...
Done: 1 pushed.
? 0
```

After `--expand` (only `...` gap filled, surrounding lines preserved):
```console
$ blobsy push data/model.bin
Pushing 1 file...
  data/model.bin (13 B) - pushed
Done: 1 pushed.
? 0
```

#### Named patterns untouched

Before and after `--expand` (no change — no unnamed wildcards):
```console
$ cat data/model.bin.yref
format: blobsy-yref/0.1
hash: [HASH]
size: 13
remote_key: [REMOTE_KEY]
? 0
```

#### `[..]` expansion

Before:
```console
$ ls -la data/model.bin
[..]
? 0
```

After `--expand`:
```console
$ ls -la data/model.bin
-rw-r--r--  1 user  staff  13 Feb 21 15:30 data/model.bin
? 0
```

## Backward Compatibility

**BACKWARD COMPATIBILITY REQUIREMENTS:**

- **Code types, methods, and function signatures**: DO NOT MAINTAIN — Internal
  refactoring is fine; no external consumers depend on internal function signatures.

- **Library APIs**: KEEP DEPRECATED — `defineConfig()` gains new optional fields
  (`wildcardPolicy`). Existing configs remain valid. No breaking changes.

- **Server APIs**: N/A

- **File formats**: KEEP DEPRECATED — New frontmatter fields (`wildcardPolicy`) are
  optional. Existing `.tryscript.md` files work unchanged. `--expand` writes back valid
  `.tryscript.md` format.

- **Database schemas**: N/A

## Stage 1: Planning Stage

### Feature Requirements

**Must Have:**

1. `--expand` CLI flag that runs all commands and fills unnamed wildcards with actual
   output
2. Expansion algorithm that matches literal lines around wildcards to determine gap
   boundaries (reuses existing matching logic from `matcher.ts`)
3. Preservation of named patterns (`[HASH]`, `[CWD]`, `[ROOT]`, `[EXE]`, custom
   `[NAME]` patterns) — expansion never touches these
4. `[..]` (single-line) expansion — replaced with the actual matched line content
5. `...` (multi-line) expansion — replaced with the actual matched lines
6. File rewriting that only modifies wildcard gaps, preserving all other content
7. Works even when command fails (expand the actual error output)
8. Summary output showing how many wildcards were expanded across how many files

**Should Have:**

9. `wildcardPolicy` config option: `'allow'` (default) | `'warn'` | `'error'`
10. Per-file frontmatter override for `wildcardPolicy`
11. Warning summary: "N blocks across M files use '...' elision. Run --expand to capture
    full output."
12. `--capture-log <path>` option that writes a YAML file with execution details

**Could Have (Future):**

13. `--auto-pattern` mode that heuristically identifies dynamic values and suggests named
    patterns (explicitly out of scope for this spec — mentioned only to clarify the
    boundary)
14. Integration with `--update` to prefer expansion behavior when possible
15. IDE/editor integration for inline wildcard warnings

### Out of Scope

- **Auto-pattern detection**: `--expand` does not try to guess which values are dynamic
  and replace them with `[HASH]` automatically. The value of `--expand` is that it forces
  human review of every output line. Auto-patternization would undermine that.
- **Non-Node.js CLI support**: Same as existing tryscript scope.
- **Changing existing `--update` behavior**: `--update` continues to work as before.

### Acceptance Criteria

1. **Basic expansion works:**
   ```bash
   tryscript run --expand tests/
   # Rewrites .tryscript.md files in place, filling unnamed wildcards
   # Shows summary: "Expanded 7 wildcards across 3 files"
   ```

2. **Named patterns preserved:**
   ```bash
   # A block with only [HASH] and [REMOTE_KEY] is untouched by --expand
   ```

3. **Mixed blocks handled correctly:**
   ```bash
   # Literal lines preserved, only ... gaps filled
   ```

4. **Wildcard policy warns:**
   ```bash
   # With wildcardPolicy: 'warn' in config:
   # "Warning: 7 blocks across 3 files use '...' elision. Run --expand to capture full output."
   ```

5. **Wildcard policy errors:**
   ```bash
   # With wildcardPolicy: 'error' in config:
   # Tests fail if unnamed wildcards present (regardless of output match)
   ```

6. **Capture log written:**
   ```bash
   tryscript run --capture-log captures.yaml tests/
   # Writes YAML file with command, actual output, expected output, captured values
   ```

7. **Help shows new options:**
   ```bash
   tryscript run --help
   # Shows --expand, --capture-log, documentation of wildcardPolicy
   ```

### What `--expand` Does NOT Do

- It does not replace `--update`. `--update` replaces the entire expected section.
  `--expand` surgically fills only unnamed wildcard gaps.
- It does not auto-pattern. After expansion, nondeterministic output will cause the test
  to fail on the next run. This is the intended forcing function — the author must review
  and add named patterns.
- It does not modify blocks that have no unnamed wildcards.

## Stage 2: Architecture Stage

### Current Architecture

Relevant source files:

| File | Purpose |
|------|---------|
| `src/lib/matcher.ts` | Pattern-to-regex conversion, output matching |
| `src/lib/updater.ts` | `--update` mode file rewriting |
| `src/lib/parser.ts` | `.tryscript.md` file parsing (frontmatter, blocks) |
| `src/lib/runner.ts` | Command execution, execution context |
| `src/lib/config.ts` | Config loading, merging, `defineConfig()` |
| `src/lib/types.ts` | Zod schemas, TypeScript types |
| `src/lib/reporter.ts` | Test result reporting, diffs, summaries |
| `src/cli/commands/run.ts` | Run command orchestration |

### Key Integration Points

1. **`matcher.ts` — `patternToRegex()`**: Already converts `...` and `[..]` to regex
   with capture groups. The expansion algorithm needs a variant that also captures the
   content matched by each unnamed wildcard. Currently `patternToRegex` uses non-capturing
   groups. We need to add *capturing* groups for unnamed wildcards so we can extract what
   they matched.

2. **`updater.ts` — `updateTestFile()`**: Rewrites files by replacing entire block
   content. The expander needs a more surgical approach: identify which parts of the
   expected output are unnamed wildcards, determine what they matched, and replace just
   those parts.

3. **`runner.ts` — `runBlock()`**: Returns `TestBlockResult` with `actualOutput`. This
   is already available for expansion.

4. **`parser.ts` — `parseBlockContent()`**: Parses expected output from blocks. The
   expander needs to know which portions of `expectedOutput` are wildcards vs. literal
   text.

5. **`config.ts` — `TryscriptConfig`**: Needs a new `wildcardPolicy` field.

6. **`commands/run.ts` — `runCommand()`**: Orchestrates tests. Needs to invoke expansion
   after test execution (similar to how `--update` works, but with different rewriting
   logic).

### Technical Design

#### Expansion Algorithm

The core challenge: given an expected output with wildcards and the actual output, extract
what each wildcard matched.

**Approach**: Modify `patternToRegex()` to use *capturing groups* for unnamed wildcards
(`...` and `[..]`), then run the regex against actual output to extract captures.

```typescript
interface WildcardCapture {
  /** Type of wildcard */
  type: 'ellipsis' | 'dotdot';
  /** The actual text that the wildcard matched */
  captured: string;
}

interface ExpansionResult {
  /** The expanded expected output (wildcards replaced with actual text) */
  expandedOutput: string;
  /** Captures for each unnamed wildcard, in order */
  captures: WildcardCapture[];
  /** Whether any expansion was performed */
  expanded: boolean;
}
```

The expansion function:
1. Parse the expected output to identify wildcard positions
2. Build a regex with capturing groups for unnamed wildcards
3. Match against actual output
4. Replace each wildcard in the expected output with its captured content
5. Return the expanded output

**Edge cases:**
- Multiple `...` in one block: each maps to a contiguous run of lines. The regex anchors
  on literal lines between wildcards.
- `...` at start or end: gap is everything before the first literal line, or after the
  last.
- Command fails: still expand — error output is often the most important to capture.
- Nondeterministic output: after expand, test will fail on next run. Intended — forces
  author to add named patterns.

#### File Rewriting (Expander)

New file `src/lib/expander.ts`:

```typescript
/**
 * Expand unnamed wildcards in test files with actual output.
 * Unlike --update which replaces entire expected sections,
 * --expand surgically fills only ... and [..] gaps.
 */
export async function expandTestFile(
  file: TestFile,
  results: TestBlockResult[],
): Promise<{ expanded: boolean; changes: string[] }>;
```

This mirrors the `updateTestFile` API but with different replacement logic.

#### Wildcard Policy

New config field in `TryscriptConfig`:

```typescript
wildcardPolicy?: 'allow' | 'warn' | 'error';
```

**Behavior:**
- `'allow'` (default): Current behavior. Unnamed wildcards match normally.
- `'warn'`: Tests still pass, but after the run a summary is printed:
  `"Warning: N blocks across M files use '...' elision. Run --expand to capture full output."`
- `'error'`: Tests with unnamed wildcards are treated as failures, regardless of whether
  the output matches. Forces named patterns or literal text.

Per-file override via frontmatter:
```yaml
---
wildcardPolicy: allow
---
```

Implementation: Check each block's `expectedOutput` for unnamed wildcards (`...` and
`[..]` patterns). Maintain a count. After the run, apply the policy.

#### Capture Log

New option `--capture-log <path>`:

```yaml
# tryscript capture log
# Generated: 2026-02-21T15:30:00Z

files:
  - path: tests/golden/push.tryscript.md
    blocks:
      - name: "Push files"
        command: "blobsy push"
        expected_exit_code: 0
        actual_exit_code: 0
        expected_output: |
          Pushing 2 files...
          ...
          Done: 2 pushed.
        actual_output: |
          Pushing 2 files...
            data/model.bin (13 B) - pushed
            data/dataset.csv (12 B) - pushed
          Done: 2 pushed.
        captures:
          - type: ellipsis
            matched: |2
                data/model.bin (13 B) - pushed
                data/dataset.csv (12 B) - pushed
        passed: true

      - name: "Check yref"
        command: "cat data/model.bin.yref"
        expected_exit_code: 0
        actual_exit_code: 0
        expected_output: |
          format: blobsy-yref/0.1
          hash: [HASH]
          size: 13
        actual_output: |
          format: blobsy-yref/0.1
          hash: sha256:d02661ea...
          size: 13
        captures:
          - type: named
            name: HASH
            matched: "sha256:d02661ea..."
        passed: true
```

This provides full transparency into what each wildcard matched, which is invaluable
for debugging and reviewing test coverage quality.

### Files to Create/Modify

| File | Changes |
|------|---------|
| `src/lib/expander.ts` | NEW: Wildcard expansion logic and file rewriting |
| `src/lib/capture-log.ts` | NEW: Capture log generation (YAML output) |
| `src/lib/matcher.ts` | Add capturing-group variant of `patternToRegex()` for expansion |
| `src/lib/types.ts` | Add `WildcardCapture`, `ExpansionResult` types; add `wildcardPolicy` to config schemas |
| `src/lib/config.ts` | Add `wildcardPolicy` to `TryscriptConfig` and `defineConfig()` |
| `src/cli/commands/run.ts` | Add `--expand`, `--capture-log` options; integrate expansion and capture log |
| `src/lib/reporter.ts` | Add wildcard policy warning/summary reporting |

### Dependencies

No new external dependencies required. The YAML output for capture log can use the
existing `yaml` package (already a dependency for frontmatter parsing).

### Testing Strategy

1. **Unit tests** for expansion algorithm: multiple `...`, `[..]`, mixed, named patterns
   preserved
2. **Unit tests** for wildcard policy: counting unnamed wildcards, policy enforcement
3. **Golden self-tests** (`.tryscript.md`): test `--expand` on files with known wildcards
4. **Capture log tests**: verify YAML output format and content

## Stage 3: Implementation Phases

### Phase 1: Core Expansion Infrastructure

Core matching changes and the expansion algorithm.

- [ ] Add capturing-group variant to `matcher.ts` (`matchAndCapture()` or similar)
- [ ] Create `src/lib/expander.ts` with expansion logic
- [ ] Add `WildcardCapture` and `ExpansionResult` types to `types.ts`
- [ ] Add `--expand` flag to run command in `commands/run.ts`
- [ ] Integrate expansion with test execution (run, match, expand, rewrite)
- [ ] Handle edge cases: multiple `...`, `...` at start/end, `[..]` expansion, failed
  commands
- [ ] Add expansion summary output ("Expanded N wildcards across M files")
- [ ] Write unit tests for expansion algorithm
- [ ] Write golden self-tests for `--expand`

### Phase 2: Wildcard Policy

Config-level governance for unnamed wildcards.

- [ ] Add `wildcardPolicy` field to `TryscriptConfig` and `TestConfigSchema` (types.ts,
  config.ts)
- [ ] Implement wildcard counting (scan `expectedOutput` for unnamed wildcards)
- [ ] Implement `'warn'` policy: print summary after run
- [ ] Implement `'error'` policy: fail tests with unnamed wildcards
- [ ] Support per-file frontmatter override
- [ ] Update `defineConfig()` type
- [ ] Write tests for policy enforcement
- [ ] Update docs command reference if applicable

### Phase 3: Capture Log

Execution detail logging for debugging and review.

- [ ] Create `src/lib/capture-log.ts` with YAML generation
- [ ] Add `--capture-log <path>` option to run command
- [ ] Capture command, actual/expected output, exit codes, wildcard captures per block
- [ ] Include both named and unnamed wildcard captures
- [ ] Write to YAML file atomically (using `atomically` library)
- [ ] Write tests for capture log output format
- [ ] Document capture log in reference docs

### Phase 4: Documentation and Polish

- [ ] Update `tryscript-reference.md` with `--expand`, `wildcardPolicy`, `--capture-log`
- [ ] Add "Recommended Workflow" section to docs emphasizing the sketch-expand-pattern
  workflow
- [ ] Add guidance on minimizing unnamed wildcards and preferring named patterns
- [ ] Document the problem (tests that verify nothing) and the solution
- [ ] Update `--help` output for new options
- [ ] Ensure all golden self-tests pass

## Open Questions

1. **Should `--expand` and `--update` be mutually exclusive?**
   Proposed: Yes. They have different semantics (`--expand` fills gaps, `--update`
   replaces everything). Running both would be confusing.

2. **Should `--expand` modify files in place or write to a separate location?**
   Proposed: In place (same as `--update`). The user can use `git diff` to review
   changes, which is the expected workflow.

3. **Capture log: YAML or JSON?**
   Proposed: YAML. It's more readable for human review, and the `yaml` package is already
   a dependency.

4. **Should wildcard policy default to `'allow'` or `'warn'`?**
   Proposed: `'allow'` for backward compatibility. Users opt into stricter policies.

5. **How should the expansion algorithm handle ambiguous matches?**
   When multiple `...` patterns exist with no literal anchors between them, the regex
   engine's greedy/lazy matching determines the split. The algorithm should use the same
   matching semantics as the test assertion (lazy matching for `...`). This matches the
   existing behavior in `patternToRegex()`.

## Risks

1. **Expansion algorithm complexity**: Multiple `...` with few literal anchors could
   produce ambiguous captures. Mitigation: use the same regex matching strategy as
   existing test assertions; document that `--expand` works best when there are literal
   anchors around wildcards.

2. **Unintended file modifications**: `--expand` rewrites `.tryscript.md` files.
   Mitigation: require explicit `--expand` flag (not default); user reviews via
   `git diff`.

3. **Nondeterministic output after expansion**: Expanded tests may fail on subsequent
   runs. Mitigation: this is intentional — it forces the author to add named patterns.
   Document this clearly.

4. **Backward compatibility of wildcardPolicy**: New config field. Mitigation: default is
   `'allow'`, preserving current behavior.
