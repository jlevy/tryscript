# Plan Spec: Wildcard Expansion and Capture Log

## Purpose

This is a technical design doc for the wildcard expansion feature (`--expand`) and
associated improvements to tryscript's wildcard system. The feature addresses a
fundamental quality problem: agents and humans routinely write golden tests with unnamed
wildcards (`...` and `[..]`) as scaffolding, then never replace them with real assertions,
resulting in tests that verify nothing.

This spec covers three interrelated changes:

1. **Unknown wildcard syntax** (`???` and `[??]`) — new patterns that explicitly mark
   output as "needs to be filled in," distinct from generic wildcards
2. **`--expand` mode** — a new CLI mode that fills wildcards with actual output, with
   levels controlling which wildcard types are expanded
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

### The Solution: Distinct Wildcard Categories

Rather than trying to govern the ambiguous `...`/`[..]` with config policies, we
introduce a new syntax that makes the author's intent explicit:

| Category | Multi-line | Single-line | Meaning |
|----------|-----------|-------------|---------|
| **Generic wildcards** | `...` | `[..]` | Intentional omission — "this output is unpredictable, skip it" |
| **Unknown wildcards** | `???` | `[??]` | Scaffolding — "I don't know the output yet, fill it in" |
| **Named patterns** | — | `[HASH]`, `[CWD]`, etc. | Typed dynamic values — "this is a specific kind of varying value" |

This resolves the ambiguity at the syntax level. Generic wildcards are legitimate test
constructs. Unknown wildcards are temporary placeholders that should never appear in
committed tests. Named patterns are the gold standard.

### The `--update` Limitation

The existing `--update` mode replaces the *entire* expected output section when a test
fails. This is too aggressive: if you have a block where some lines are correct and only
a wildcard gap needs filling, `--update` discards the lines you already had right. There
is no way to surgically fill just the wildcard gaps.

### Impact on Agent-Written Tests

In practice, LLM agents generating golden tests for CLI tools (e.g., blobsy) produce
files like:

```console
$ blobsy push
???
? 0
```

With the new syntax, agents should use `???` (unknown) instead of `...` (generic) when
scaffolding. This makes the intent explicit and enables targeted expansion.

### Related Docs

- [Elision patterns in development.md](../../development.md#elision-patterns)
- [Coverage plan spec](../done/plan-2026-01-04-builtin-coverage-support.md)

## Summary of Task

Implement three features that work together to improve wildcard discipline:

1. **Unknown wildcard syntax** (`???` and `[??]`): New patterns that behave identically
   to `...` and `[..]` for matching purposes, but signal "this is scaffolding, fill it
   in." These should never appear in committed tests.

2. **`--expand` flag with levels**: Run all commands and replace wildcards with actual
   output. The level controls which wildcards are expanded:

   - `--expand` or `--expand=unknown` — expand only `???` and `[??]` (default; the
     common workflow case)
   - `--expand=generic` — expand `...`, `[..]`, `???`, and `[??]` (all unnamed
     wildcards)
   - `--expand=all` — expand everything, including named patterns like `[HASH]` (a
     debugging/audit tool, not for committing)

3. **Capture log**: An optional YAML file (`--capture-log <path>`) that records, for
   every test block execution: the command, actual output, expected output, actual and
   expected exit codes, and the captured values of all wildcard patterns.

### Wildcard Hierarchy

The expansion levels form a hierarchy:

```
unknown  <  generic  <  all
(???,        (...,       (everything
 [??])       [..],       including
             ???,        [HASH],
             [??])       [CWD], etc.)
```

Each level includes all wildcards from the level below it.

### The Recommended Workflow

**Pass 1: Sketch** — Write commands with `???` as scaffolding. Focus on getting
scenarios right.

```console
$ blobsy push
???
? 0
```

**Pass 2: Expand** — Run `tryscript run --expand`. Every `???` is filled with real
output.

```console
$ blobsy push
Pushing 2 files...
  data/model.bin (13 B) - pushed
  data/dataset.csv (12 B) - pushed
Done: 2 pushed.
? 0
```

**Pass 3: Review and pattern** — Go through expanded output. Replace genuinely
unstable values with named patterns (`[HASH]`, `[TIMESTAMP]`, etc.). Values that are
unpredictable but unimportant can use `...`/`[..]` (generic). Leave everything else
literal.

**Pass 4: Commit** — Full output coverage. No `???`/`[??]` remaining. Only `...`/`[..]`
for intentional omissions and `[NAME]` for typed dynamic values.

### Before/After Examples

#### Unknown wildcard expansion (`--expand` / `--expand=unknown`)

Before (scaffold):
```console
$ blobsy push
???
? 0
```

After:
```console
$ blobsy push
Pushing 2 files...
  data/model.bin (13 B) - pushed
  data/dataset.csv (12 B) - pushed
Done: 2 pushed.
? 0
```

#### Generic wildcards are NOT expanded at `unknown` level

This block is unchanged by `--expand=unknown`:
```console
$ blobsy push data/model.bin
Pushing 1 file...
...
Done: 1 pushed.
? 0
```

#### Generic wildcard expansion (`--expand=generic`)

Before:
```console
$ blobsy push data/model.bin
Pushing 1 file...
...
Done: 1 pushed.
? 0
```

After `--expand=generic` (only `...` gap filled, surrounding lines preserved):
```console
$ blobsy push data/model.bin
Pushing 1 file...
  data/model.bin (13 B) - pushed
Done: 1 pushed.
? 0
```

#### Named patterns untouched at `generic` level

Before and after `--expand=generic` (no change — only named patterns remain):
```console
$ cat data/model.bin.yref
format: blobsy-yref/0.1
hash: [HASH]
size: 13
remote_key: [REMOTE_KEY]
? 0
```

#### Full expansion (`--expand=all`)

`--expand=all` also expands named patterns (for debugging/audit):
```console
$ cat data/model.bin.yref
format: blobsy-yref/0.1
hash: sha256:d02661eabc1f...
size: 13
remote_key: 20260221T153007Z-7a3f0e9b2c1d/data/model.bin
? 0
```

This is a debugging tool. The result should be reviewed, not committed, since it
removes all named patterns.

#### `[??]` expansion

Before:
```console
$ ls -la data/model.bin
[??]
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

- **Library APIs**: KEEP DEPRECATED — `defineConfig()` gains no new required fields.
  Existing configs remain valid. No breaking changes.

- **Server APIs**: N/A

- **File formats**: KEEP DEPRECATED — `???` and `[??]` are new syntax; existing
  `.tryscript.md` files work unchanged. Files using the new syntax also work with older
  tryscript versions (they'd match as literal text and likely fail, which is the safe
  direction). `--expand` writes back valid `.tryscript.md` format.

- **Database schemas**: N/A

## Stage 1: Planning Stage

### Feature Requirements

**Must Have:**

1. `???` (multi-line unknown wildcard) syntax — matches identically to `...` in test
   execution
2. `[??]` (single-line unknown wildcard) syntax — matches identically to `[..]` in test
   execution
3. `--expand` CLI flag (default level: `unknown`) that fills unknown wildcards with
   actual output
4. `--expand=generic` level that fills both generic and unknown wildcards
5. `--expand=all` level that fills all wildcards including named patterns
6. Expansion algorithm that matches literal lines around wildcards to determine gap
   boundaries (reuses existing matching logic from `matcher.ts`)
7. File rewriting that only modifies targeted wildcard gaps, preserving all other content
8. Works even when command fails (expand the actual error output)
9. Summary output showing how many wildcards were expanded across how many files

**Should Have:**

10. Warning if `???`/`[??]` are present in test files (always shown, no config needed —
    their presence is itself the signal)
11. `--capture-log <path>` option that writes a YAML file with execution details
12. Documentation updates: recommended workflow, wildcard category guidance, agent
    instructions

**Could Have (Future):**

13. `--auto-pattern` mode that heuristically identifies dynamic values and suggests named
    patterns (explicitly out of scope — mentioned only to clarify the boundary)
14. Integration with `--update` to prefer expansion behavior when possible
15. CI check that fails if `???`/`[??]` appear in committed tests

### Out of Scope

- **Auto-pattern detection**: `--expand` does not try to guess which values are dynamic.
  The value of `--expand` is that it forces human review. Auto-patternization would
  undermine that.
- **Non-Node.js CLI support**: Same as existing tryscript scope.
- **Changing existing `--update` behavior**: `--update` continues to work as before.
- **Config-level `wildcardPolicy`**: The `???`/`[??]` syntax replaces the need for a
  config-level `allow`/`warn`/`error` policy. The presence of unknown wildcards is
  itself the signal. A simple warning when `???`/`[??]` are encountered is sufficient.

### Acceptance Criteria

1. **`???` and `[??]` match correctly:**
   ```bash
   # ??? behaves like ... for matching
   # [??] behaves like [..] for matching
   # Tests with ??? or [??] pass if output matches
   ```

2. **`--expand` (unknown level) works:**
   ```bash
   tryscript run --expand tests/
   # Fills only ??? and [??] with actual output
   # Shows summary: "Expanded 7 unknown wildcards across 3 files"
   ```

3. **`--expand=generic` works:**
   ```bash
   tryscript run --expand=generic tests/
   # Fills ..., [..], ???, and [??] with actual output
   # Named patterns preserved
   ```

4. **`--expand=all` works:**
   ```bash
   tryscript run --expand=all tests/
   # Fills everything including [HASH], [CWD], etc.
   ```

5. **Generic wildcards untouched at unknown level:**
   ```bash
   # A block with ... but no ??? is unchanged by --expand
   ```

6. **Warning on unknown wildcards:**
   ```bash
   tryscript run tests/
   # If ??? or [??] present:
   # "Warning: 7 blocks across 3 files contain unknown wildcards (???/[??]).
   #  Run --expand to fill them."
   ```

7. **Capture log written:**
   ```bash
   tryscript run --capture-log captures.yaml tests/
   # Writes YAML with command, output, captures for all wildcard types
   ```

8. **Help shows new options:**
   ```bash
   tryscript run --help
   # Shows --expand, --capture-log, documents ???/[??] syntax
   ```

### What `--expand` Does NOT Do

- It does not replace `--update`. `--update` replaces the entire expected section.
  `--expand` surgically fills only targeted wildcard gaps.
- It does not auto-pattern. After expansion of generic wildcards, nondeterministic output
  will cause the test to fail on the next run. This is the intended forcing function.
- At the `unknown` level, it does not touch generic wildcards (`...`, `[..]`).
- At the `generic` level, it does not touch named patterns.

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

1. **`matcher.ts` — `patternToRegex()`**: Already converts `...` and `[..]` to regex.
   Needs to also recognize `???` and `[??]` as equivalent matching patterns. For
   expansion, we need a variant that uses *capturing groups* so we can extract what each
   wildcard matched, annotated by wildcard type (unknown, generic, named).

2. **`updater.ts` — `updateTestFile()`**: Rewrites files by replacing entire block
   content. The expander needs a more surgical approach: identify which parts of the
   expected output are wildcards of the targeted type, determine what they matched, and
   replace just those parts.

3. **`runner.ts` — `runBlock()`**: Returns `TestBlockResult` with `actualOutput`. This
   is already available for expansion.

4. **`parser.ts` — `parseBlockContent()`**: Parses expected output from blocks. No
   changes needed — `???` and `[??]` will appear in `expectedOutput` as literal text,
   and `matcher.ts` handles the pattern recognition.

5. **`commands/run.ts` — `runCommand()`**: Orchestrates tests. Needs to invoke expansion
   after test execution (similar to how `--update` works, but with different rewriting
   logic). Needs to count unknown wildcards for the warning.

### Technical Design

#### Wildcard Type Classification

```typescript
/** Categories of wildcards, forming a hierarchy for --expand levels. */
type WildcardCategory = 'unknown' | 'generic' | 'named';

/** Which wildcards each --expand level targets. */
type ExpandLevel = 'unknown' | 'generic' | 'all';
```

Mapping:
- `unknown` level targets: `???`, `[??]`
- `generic` level targets: `???`, `[??]`, `...`, `[..]`
- `all` level targets: everything (including `[HASH]`, `[CWD]`, etc.)

#### Changes to `matcher.ts`

Add `???` and `[??]` as pattern types alongside `...` and `[..]`:

```typescript
// In patternToRegex():

// Replace [??] with marker (same regex as [..])
const unknownDotdotMarker = getMarker();
replacements.set(unknownDotdotMarker, '[^\\n]*');
processed = processed.replaceAll('[??]', unknownDotdotMarker);

// Replace ??? (followed by newline) with marker (same regex as ...)
const unknownEllipsisMarker = getMarker();
replacements.set(unknownEllipsisMarker, '(?:[^\\n]*\\n)*');
processed = processed.replace(/\?\?\?\n/g, unknownEllipsisMarker);
```

Add a new function `matchAndCapture()` that returns capturing groups annotated by
wildcard type:

```typescript
interface WildcardCapture {
  /** Category of the wildcard that was matched */
  category: WildcardCategory;
  /** For named patterns, the pattern name (e.g., 'HASH') */
  name?: string;
  /** Whether this is multi-line (ellipsis/???) or single-line (dotdot/[??]) */
  multiline: boolean;
  /** The actual text that the wildcard matched */
  captured: string;
}

/**
 * Match actual output against expected pattern and return captures
 * for each wildcard, annotated by type.
 */
function matchAndCapture(
  actual: string,
  expected: string,
  context: { root: string; cwd: string },
  customPatterns?: Record<string, string | RegExp>,
): WildcardCapture[] | null;
```

#### Expansion Algorithm

The core challenge: given an expected output with wildcards and the actual output, extract
what each wildcard matched, then replace only the targeted wildcard types.

**Approach**: Use `matchAndCapture()` to get captures for all wildcards. Then walk the
expected output, replacing each wildcard of the targeted type with its captured content.

```typescript
interface ExpansionResult {
  /** The expanded expected output */
  expandedOutput: string;
  /** Captures for each wildcard */
  captures: WildcardCapture[];
  /** Count of wildcards actually expanded */
  expandedCount: number;
}

function expandExpectedOutput(
  expected: string,
  actual: string,
  context: { root: string; cwd: string },
  level: ExpandLevel,
  customPatterns?: Record<string, string | RegExp>,
): ExpansionResult | null;
```

**Edge cases:**
- Multiple `???` in one block: same as multiple `...` — the regex anchors on literal
  lines between wildcards.
- `???` at start or end: gap is everything before the first literal line, or after the
  last.
- Command fails: still expand — error output is often the most important to capture.
- Nondeterministic output after generic expansion: intended forcing function.
- `--expand=all` expanding named patterns: replaces `[HASH]` with literal value. This
  is meant for review, not committing.

#### File Rewriting (Expander)

New file `src/lib/expander.ts`:

```typescript
/**
 * Expand wildcards in test files with actual output.
 *
 * Unlike --update which replaces entire expected sections,
 * --expand surgically fills only targeted wildcard gaps based on
 * the expansion level.
 */
export async function expandTestFile(
  file: TestFile,
  results: TestBlockResult[],
  level: ExpandLevel,
  context: { root: string; cwd: string },
  customPatterns?: Record<string, string | RegExp>,
): Promise<{ expanded: boolean; expandedCount: number; changes: string[] }>;
```

#### Unknown Wildcard Warning

When running normally (no `--expand`), if any `???` or `[??]` are present in the test
files, print a warning after the summary:

```
Warning: 7 blocks across 3 files contain unknown wildcards (???/[??]).
Run --expand to fill them with actual output.
```

This requires no config — the presence of `???`/`[??]` is itself the signal. This is
a simple scan of `expectedOutput` for these patterns.

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
          ???
          Done: 2 pushed.
        actual_output: |
          Pushing 2 files...
            data/model.bin (13 B) - pushed
            data/dataset.csv (12 B) - pushed
          Done: 2 pushed.
        captures:
          - category: unknown
            multiline: true
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
          - category: named
            name: HASH
            multiline: false
            matched: "sha256:d02661ea..."
        passed: true
```

### Files to Create/Modify

| File | Changes |
|------|---------|
| `src/lib/expander.ts` | NEW: Wildcard expansion logic and file rewriting |
| `src/lib/capture-log.ts` | NEW: Capture log generation (YAML output) |
| `src/lib/matcher.ts` | Add `???`/`[??]` recognition; add `matchAndCapture()` with capturing groups |
| `src/lib/types.ts` | Add `WildcardCapture`, `ExpansionResult`, `ExpandLevel` types |
| `src/cli/commands/run.ts` | Add `--expand[=level]`, `--capture-log` options; integrate expansion, warning, capture log |
| `src/lib/reporter.ts` | Add unknown wildcard warning output |

### Dependencies

No new external dependencies required. The YAML output for capture log can use the
existing `yaml` package (already a dependency for frontmatter parsing).

### Testing Strategy

1. **Unit tests** for `???`/`[??]` matching: verify they match identically to `...`/`[..]`
2. **Unit tests** for expansion algorithm: multiple wildcards, mixed types, levels
3. **Unit tests** for `matchAndCapture()`: correct type annotations on captures
4. **Golden self-tests** (`.tryscript.md`): test `--expand` at each level
5. **Capture log tests**: verify YAML output format and content

## Stage 3: Implementation Phases

### Phase 1: Unknown Wildcard Syntax

Add `???` and `[??]` as recognized patterns.

- [ ] Add `???` handling to `patternToRegex()` in `matcher.ts` (same regex as `...`)
- [ ] Add `[??]` handling to `patternToRegex()` in `matcher.ts` (same regex as `[..]`)
- [ ] Add `ExpandLevel` and `WildcardCategory` types to `types.ts`
- [ ] Write unit tests verifying `???` and `[??]` match correctly
- [ ] Write a golden self-test for `???` and `[??]` patterns
- [ ] Update elision pattern documentation table

### Phase 2: Expansion Infrastructure

Core expansion algorithm and `--expand` flag.

- [ ] Add `matchAndCapture()` to `matcher.ts` — capturing-group variant that annotates
  captures by wildcard category
- [ ] Create `src/lib/expander.ts` with expansion logic (`expandExpectedOutput()`,
  `expandTestFile()`)
- [ ] Handle all three expand levels: `unknown`, `generic`, `all`
- [ ] Add `--expand[=level]` flag to run command in `commands/run.ts` (default: `unknown`)
- [ ] Integrate expansion with test execution (run, match, expand, rewrite)
- [ ] Handle edge cases: multiple wildcards, wildcards at start/end, failed commands
- [ ] Add expansion summary output ("Expanded N wildcards across M files")
- [ ] Ensure `--expand` and `--update` are mutually exclusive
- [ ] Write unit tests for expansion algorithm at each level
- [ ] Write golden self-tests for `--expand`

### Phase 3: Warning and Capture Log

Unknown wildcard warning and execution detail logging.

- [ ] Implement unknown wildcard counting (scan `expectedOutput` for `???` and `[??]`)
- [ ] Print warning after run if unknown wildcards present
- [ ] Create `src/lib/capture-log.ts` with YAML generation
- [ ] Add `--capture-log <path>` option to run command
- [ ] Capture command, actual/expected output, exit codes, wildcard captures per block
- [ ] Include all wildcard categories (unknown, generic, named) in captures
- [ ] Write to YAML file atomically (using `atomically` library)
- [ ] Write tests for warning and capture log output

### Phase 4: Documentation

- [ ] Update `tryscript-reference.md` with `???`/`[??]` syntax, `--expand` levels,
  `--capture-log`
- [ ] Add "Recommended Workflow" section emphasizing sketch-expand-pattern with `???`
- [ ] Add wildcard category table (generic, unknown, named) to docs
- [ ] Add guidance: agents should use `???` for scaffolding, not `...`
- [ ] Document that `???`/`[??]` should never appear in committed tests
- [ ] Update `--help` output for new options
- [ ] Ensure all golden self-tests pass

## Open Questions

1. **Should `--expand` and `--update` be mutually exclusive?**
   Proposed: Yes. They have different semantics (`--expand` fills gaps, `--update`
   replaces everything). Running both would be confusing.

2. **Should `--expand` modify files in place or write to a separate location?**
   Proposed: In place (same as `--update`). The user can use `git diff` to review
   changes, which is the expected workflow.

3. **Default `--expand` level?**
   Proposed: `unknown`. This is the common case in the sketch-expand-pattern workflow.
   `--expand` with no value means `--expand=unknown`.

4. **Should we warn or error on `???`/`[??]`?**
   Proposed: Warn (not error). Tests with `???`/`[??]` still pass — they match like
   `...`/`[..]`. But a warning is printed nudging the author to run `--expand`. A
   future CI check could enforce that committed tests have no unknown wildcards.

5. **Capture log: YAML or JSON?**
   Proposed: YAML. More readable for human review; `yaml` package already a dependency.

6. **How should the expansion algorithm handle ambiguous matches?**
   When multiple wildcards exist with no literal anchors between them, the regex engine's
   greedy/lazy matching determines the split. The algorithm should use the same matching
   semantics as the test assertion (lazy matching). This matches the existing behavior in
   `patternToRegex()`.

## Risks

1. **Expansion algorithm complexity**: Multiple wildcards with few literal anchors could
   produce ambiguous captures. Mitigation: use the same regex strategy as existing test
   assertions; document that `--expand` works best with literal anchors around wildcards.

2. **Unintended file modifications**: `--expand` rewrites `.tryscript.md` files.
   Mitigation: require explicit `--expand` flag (not default); user reviews via
   `git diff`.

3. **Nondeterministic output after generic expansion**: Expanded tests may fail on
   subsequent runs. Mitigation: this is intentional — forces adding named patterns.
   Document clearly.

4. **New syntax adoption**: Agents and users need to learn to use `???` instead of `...`
   for scaffolding. Mitigation: document the workflow clearly; the warning when `???` is
   present provides guidance.
