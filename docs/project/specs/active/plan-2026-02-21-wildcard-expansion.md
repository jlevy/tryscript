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
2. **`--expand` / `--expand-generic` / `--expand-all` flags** — three boolean CLI flags
   that fill wildcards with actual output, each targeting a broader set of wildcard types
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

In practice, LLM agents generating golden tests for CLI tools produce files like:

```console
$ my-cli push
???
? 0
```

With the new syntax, agents should use `???` (unknown) instead of `...` (generic) when
scaffolding. This makes the intent explicit and enables targeted expansion.

### Related Docs

- [Elision patterns in development.md](../../development.md#elision-patterns)
- [Elision patterns in tryscript-reference.md](../../tryscript-reference.md#elision-patterns)
- [Root README — elision pattern mentions](../../../../README.md)
- [Package README — elision pattern mentions](../../../../packages/tryscript/README.md)
- [Coverage plan spec](../done/plan-2026-01-04-builtin-coverage-support.md)

## Summary of Task

Implement three features that work together to improve wildcard discipline:

1. **Unknown wildcard syntax** (`???` and `[??]`): New patterns that behave identically
   to `...` and `[..]` for matching purposes, but signal "this is scaffolding, fill it
   in." These are temporary scaffolding, intended to be expanded before finalizing.

2. **Three expansion flags** (boolean, mutually exclusive):

   - `--expand` — expand only unknown wildcards (`???` and `[??]`). This is the standard
     workflow flag.
   - `--expand-generic` — expand all unnamed wildcards: generic (`...`, `[..]`) plus
     unknown (`???`, `[??]`). Useful for auditing existing tests.
   - `--expand-all` — expand everything, including named patterns like `[HASH]`.
     Useful for debugging (to see exactly what every pattern matched) and also for
     refining tests to be less generic (replacing a `[..]` or `[HASH]` with the actual
     literal value if it turns out to be stable). Whether to commit the result depends
     on whether the expanded output is consistent and reliable across runs.

3. **Capture log**: An optional YAML file (`--capture-log <path>`) that records, for
   every test block execution: the command, actual output, expected output, actual and
   expected exit codes, and the captured values of all wildcard patterns.

### Expansion Flag Hierarchy

Each flag includes everything the previous flag targets:

```
--expand         targets: ???, [??]
--expand-generic targets: ???, [??], ..., [..]
--expand-all     targets: ???, [??], ..., [..], [HASH], [CWD], all named patterns
```

### The Recommended Workflow

**Always use unknown wildcards (`???`, `[??]`) when scaffolding.** Never use generic
wildcards (`...`, `[..]`) as placeholders. The unknown syntax exists precisely to signal
"this needs to be filled in."

**Pass 1: Sketch** — Write commands with `???` as scaffolding. Focus on getting
scenarios right.

```console
$ my-cli push
???
? 0

$ cat output/manifest.json
???
? 0
```

**Pass 2: Expand** — Run `tryscript run --expand`. Every `???` is filled with real
output. Review the diff.

```console
$ my-cli push
Pushing 2 files...
  data/model.bin (13 B) - pushed
  data/dataset.csv (12 B) - pushed
Done: 2 pushed.
? 0

$ cat output/manifest.json
{"version": "1.0", "hash": "sha256:d02661eabc1f4a7b...", "timestamp": "2026-02-21T15:30:07Z"}
? 0
```

**Pass 3: Review and pattern** — Go through expanded output. Replace dynamic values
with named patterns wherever possible (`[HASH]`, `[TIMESTAMP]`, etc.). For values that
are unpredictable and where defining a named pattern is impractical, use generic
wildcards (`...`/`[..]`). Prefer named patterns over generic wildcards — they document
what kind of value varies and why. Leave everything else literal.

```console
$ cat output/manifest.json
{"version": "1.0", "hash": "[HASH]", "timestamp": "[TIMESTAMP]"}
? 0
```

**Pass 4: Commit** — Full output coverage. No `???`/`[??]` remaining. Only named
patterns for typed dynamic values and generic wildcards (`...`/`[..]`) as a last
resort for output that is genuinely difficult to pattern-match.

### Before/After Examples

#### Unknown wildcard expansion (`--expand`)

Before (scaffold):
```console
$ my-cli push
???
? 0
```

After `tryscript run --expand`:
```console
$ my-cli push
Pushing 2 files...
  data/model.bin (13 B) - pushed
  data/dataset.csv (12 B) - pushed
Done: 2 pushed.
? 0
```

#### `[??]` expansion (`--expand`)

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

#### Generic wildcards are NOT expanded by `--expand`

This block is unchanged by `--expand` — it uses `...` (generic), not `???` (unknown):
```console
$ my-cli push data/model.bin
Pushing 1 file...
...
Done: 1 pushed.
? 0
```

#### Generic wildcard expansion (`--expand-generic`)

Before:
```console
$ my-cli push data/model.bin
Pushing 1 file...
...
Done: 1 pushed.
? 0
```

After `tryscript run --expand-generic` (only `...` gap filled, surrounding lines
preserved):
```console
$ my-cli push data/model.bin
Pushing 1 file...
  data/model.bin (13 B) - pushed
Done: 1 pushed.
? 0
```

#### Named patterns untouched by `--expand-generic`

Before and after `--expand-generic` (no change — only named patterns remain):
```console
$ cat output/manifest.json
{"version": "1.0", "hash": "[HASH]", "timestamp": "[TIMESTAMP]"}
? 0
```

#### Full expansion (`--expand-all`)

`--expand-all` also expands named patterns:
```console
$ cat output/manifest.json
{"version": "1.0", "hash": "sha256:d02661eabc1f...", "timestamp": "2026-02-21T15:30:07Z"}
? 0
```

This is useful for two purposes:
- **Debugging**: See exactly what every pattern matched, to understand test behavior.
- **Refining tests**: If an expanded value turns out to be stable and consistent across
  runs, you may want to commit the literal value instead of keeping the wildcard. For
  example, a `[..]` that always matches the same string is a sign the wildcard was
  unnecessary — replacing it with the literal makes the test more precise.

Whether to commit the result of `--expand-all` depends on whether the expanded output is
reliable across runs and environments. If it contains timestamps, PIDs, or other
nondeterministic values, those need named patterns.

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
3. `--expand` boolean flag — fills unknown wildcards (`???`, `[??]`) with actual output
4. `--expand-generic` boolean flag — fills generic (`...`, `[..]`) and unknown wildcards
5. `--expand-all` boolean flag — fills all wildcards including named patterns
6. The three flags are mutually exclusive (error if more than one specified)
7. Expansion algorithm that matches literal lines around wildcards to determine gap
   boundaries (reuses existing matching logic from `matcher.ts`)
8. File rewriting that only modifies targeted wildcard gaps, preserving all other content
9. Works even when command fails (expand the actual error output)
10. Summary output showing how many wildcards were expanded across how many files

**Should Have:**

11. Unconditional warning if `???`/`[??]` are present in test files — always shown on
    every run, regardless of flags. No warning for generic wildcards (`...`/`[..]`).
12. `--capture-log <path>` option that writes a YAML file with execution details
13. Documentation updates: recommended workflow, wildcard category guidance, agent
    instructions

**Could Have (Future):**

14. `--auto-pattern` mode that heuristically identifies dynamic values and suggests named
    patterns (explicitly out of scope — mentioned only to clarify the boundary)
15. Integration with `--update` to prefer expansion behavior when possible
16. CI check that fails if `???`/`[??]` appear in committed tests

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

2. **`--expand` works:**
   ```bash
   tryscript run --expand tests/
   # Fills only ??? and [??] with actual output
   # Shows summary: "Expanded 7 unknown wildcards across 3 files"
   ```

3. **`--expand-generic` works:**
   ```bash
   tryscript run --expand-generic tests/
   # Fills ..., [..], ???, and [??] with actual output
   # Named patterns preserved
   ```

4. **`--expand-all` works:**
   ```bash
   tryscript run --expand-all tests/
   # Fills everything including [HASH], [CWD], etc.
   ```

5. **Generic wildcards untouched by `--expand`:**
   ```bash
   # A block with ... but no ??? is unchanged by --expand
   ```

6. **Flags are mutually exclusive:**
   ```bash
   tryscript run --expand --expand-generic tests/
   # Error: --expand, --expand-generic, and --expand-all are mutually exclusive
   ```

7. **Warning on unknown wildcards (always, unconditionally):**
   ```bash
   tryscript run tests/
   # If ??? or [??] present (with or without --expand):
   # "Warning: 7 blocks across 3 files contain unknown wildcards (???/[??]).
   #  Run --expand to fill them."
   # Generic wildcards (..., [..]) do NOT trigger warnings.
   ```

8. **Capture log written:**
   ```bash
   tryscript run --capture-log captures.yaml tests/
   # Writes YAML with command, output, captures for all wildcard types
   ```

9. **Help shows new options:**
   ```bash
   tryscript run --help
   # Shows --expand, --expand-generic, --expand-all, --capture-log
   ```

### What the Expand Flags Do NOT Do

- They do not replace `--update`. `--update` replaces the entire expected section.
  Expand flags surgically fill only targeted wildcard gaps.
- They do not auto-pattern. After expansion, nondeterministic output will cause the test
  to fail on the next run. This is the intended forcing function — the author must review
  and add named patterns.
- `--expand` does not touch generic wildcards (`...`, `[..]`).
- `--expand-generic` does not touch named patterns.

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
/** Categories of wildcards, forming a hierarchy for expansion flags. */
type WildcardCategory = 'unknown' | 'generic' | 'named';

/** Which wildcards each flag targets. */
type ExpandLevel = 'unknown' | 'generic' | 'all';
```

Mapping from flags to expand levels:
- `--expand` -> level `unknown`: targets `???`, `[??]`
- `--expand-generic` -> level `generic`: targets `???`, `[??]`, `...`, `[..]`
- `--expand-all` -> level `all`: targets everything (including `[HASH]`, `[CWD]`, etc.)

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
- `--expand-all` expanding named patterns: replaces `[HASH]` with literal value. May
  be committed if the value is stable, or used for debugging and then reverted.

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

**Always warn when unknown wildcards are present.** Whenever tryscript runs tests and
any `???` or `[??]` appear in the test files, print a warning after the summary —
regardless of whether `--expand` was specified. This warning is unconditional: the
presence of `???`/`[??]` is itself the signal that work remains.

Generic wildcards (`...`/`[..]`) do NOT trigger any warning. They are legitimate test
constructs representing intentional omission.

```
Warning: 7 blocks across 3 files contain unknown wildcards (???/[??]).
Run --expand to fill them with actual output.
```

This requires no config. It is a simple scan of `expectedOutput` for these patterns.

#### Capture Log

New option `--capture-log <path>`:

```yaml
# tryscript capture log
# Generated: 2026-02-21T15:30:00Z

files:
  - path: tests/golden/push.tryscript.md
    blocks:
      - name: "Push files"
        command: "my-cli push"
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

      - name: "Check manifest"
        command: "cat output/manifest.json"
        expected_exit_code: 0
        actual_exit_code: 0
        expected_output: |
          {"version": "1.0", "hash": "[HASH]", "timestamp": "[TIMESTAMP]"}
        actual_output: |
          {"version": "1.0", "hash": "sha256:d02661ea...", "timestamp": "2026-02-21T15:30:07Z"}
        captures:
          - category: named
            name: HASH
            multiline: false
            matched: "sha256:d02661ea..."
          - category: named
            name: TIMESTAMP
            multiline: false
            matched: "2026-02-21T15:30:07Z"
        passed: true
```

### Files to Create/Modify

| File | Changes |
|------|---------|
| `src/lib/expander.ts` | NEW: Wildcard expansion logic and file rewriting |
| `src/lib/capture-log.ts` | NEW: Capture log generation (YAML output) |
| `src/lib/matcher.ts` | Add `???`/`[??]` recognition; add `matchAndCapture()` with capturing groups |
| `src/lib/types.ts` | Add `WildcardCapture`, `ExpansionResult`, `ExpandLevel` types |
| `src/cli/commands/run.ts` | Add `--expand`, `--expand-generic`, `--expand-all`, `--capture-log` flags; integrate expansion, warning, capture log |
| `src/lib/reporter.ts` | Add unknown wildcard warning output |
| `README.md` | Add wildcard categories summary, preference order, expand flags, best practices |
| `packages/tryscript/README.md` | Mirror root README wildcard/expand documentation updates |
| `docs/development.md` | Add `???`/`[??]` to Elision Patterns table, expand flags to CLI Options, wildcard best practices |
| `docs/tryscript-reference.md` | Restructure Elision Patterns into three categories, add expansion section, capture log docs |

### Dependencies

No new external dependencies required. The YAML output for capture log can use the
existing `yaml` package (already a dependency for frontmatter parsing).

### Testing Strategy

1. **Unit tests** for `???`/`[??]` matching: verify they match identically to `...`/`[..]`
2. **Unit tests** for expansion algorithm: multiple wildcards, mixed types, levels
3. **Unit tests** for `matchAndCapture()`: correct type annotations on captures
4. **Golden self-tests** (`.tryscript.md`): comprehensive expansion session test
5. **Capture log tests**: verify YAML output format and content

### Golden Self-Test Design: Expansion Session

The key self-test is a golden session test (`tests/expand.tryscript.md`) that
demonstrates the full expansion workflow with diffs at each level. This test uses
fixture files containing a mix of unknown, generic, and named wildcards, runs expansion
at each level, and verifies via `diff` that the correct wildcards were expanded at each
step.

#### Fixture Files

**`cli-fixtures/expand-source.md`** — A test file with all three wildcard categories.
This is the "before" state. The test copies it into the sandbox and runs expand at each
level.

```markdown
# Test: Deterministic output with unknown wildcards

` ``console
$ echo "hello world"
???
? 0
` ``

# Test: Deterministic output with single-line unknown

` ``console
$ echo "version 1.2.3"
version [??]
? 0
` ``

# Test: Deterministic output with generic wildcard

` ``console
$ printf "line 1\nline 2\nline 3\n"
line 1
...
line 3
? 0
` ``

# Test: Deterministic output with single-line generic

` ``console
$ echo "time: 42ms"
time: [..]
? 0
` ``

# Test: Deterministic output with named pattern

` ``console
$ echo "hash: abc123"
hash: [HASH]
? 0
` ``

# Test: Mixed unknown and generic

` ``console
$ printf "header\nfirst\nsecond\nfooter\n"
header
???
footer
? 0
` ``

# Test: Mixed unknown and named

` ``console
$ echo "id: abc123 status: ok"
id: [HASH] status: [??]
? 0
` ``
```

(Note: backticks in the fixture above are shown with a space for readability in this
spec. The actual fixture files use proper markdown fencing.)

**`cli-fixtures/expand-expected-after-unknown.md`** — Expected state after
`--expand` (only `???` and `[??]` filled).

**`cli-fixtures/expand-expected-after-generic.md`** — Expected state after
`--expand-generic` (unknown + generic filled, named preserved).

**`cli-fixtures/expand-expected-after-all.md`** — Expected state after
`--expand-all` (everything filled).

#### The Golden Session Test

The `tests/expand.tryscript.md` test runs the following session:

1. **Copy fixture to sandbox** (via frontmatter fixtures)
2. **Run `--expand` on the fixture** (unknown wildcards only)
3. **Diff the file** to verify only `???` and `[??]` were replaced
4. **Restore the original** and **run `--expand-generic`**
5. **Diff again** to verify `...` and `[..]` are now also replaced
6. **Restore** and **run `--expand-all`**
7. **Diff again** to verify `[HASH]` (named) is now also replaced
8. **Verify the expansion summary output** at each level

The diffs at each level demonstrate the progressive expansion — each flag targets a
broader set of wildcards:

- After `--expand`: `???` -> `"first\nsecond"`, `[??]` -> `"1.2.3"`, `"ok"`. Generic
  and named wildcards unchanged.
- After `--expand-generic`: additionally `...` -> `"line 2"`, `[..]` -> `"42ms"`.
  Named wildcards unchanged.
- After `--expand-all`: additionally `[HASH]` -> `"abc123"`.

This test structure validates:
- Correct wildcard targeting at each level
- Surgical replacement (surrounding literal text preserved)
- Mixed wildcards in the same block handled correctly
- The expand summary shows correct counts
- Files are modified in place (same as `--update`)

#### Additional Golden Tests

- **`tests/expand-warning.tryscript.md`**: Run a fixture with `???` without `--expand`,
  verify the warning message appears in output.
- **`tests/expand-mutual-exclusion.tryscript.md`**: Verify that combining `--expand`
  with `--expand-generic`, `--expand-all`, or `--update` produces an error.
- **`tests/expand-no-change.tryscript.md`**: Run `--expand` on a file with only generic
  and named wildcards (no `???`/`[??]`), verify no modifications.

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

Core expansion algorithm and expansion flags.

- [ ] Add `matchAndCapture()` to `matcher.ts` — capturing-group variant that annotates
  captures by wildcard category
- [ ] Create `src/lib/expander.ts` with expansion logic (`expandExpectedOutput()`,
  `expandTestFile()`)
- [ ] Handle all three expand levels: `unknown`, `generic`, `all`
- [ ] Add `--expand`, `--expand-generic`, `--expand-all` boolean flags to run command in
  `commands/run.ts`
- [ ] Validate mutual exclusivity (error if more than one expand flag specified)
- [ ] Validate mutual exclusivity with `--update`
- [ ] Integrate expansion with test execution (run, match, expand, rewrite)
- [ ] Handle edge cases: multiple wildcards, wildcards at start/end, failed commands
- [ ] Add expansion summary output ("Expanded N wildcards across M files")
- [ ] Write unit tests for expansion algorithm at each level
- [ ] Create fixture files for expansion testing:
  - `cli-fixtures/expand-source.md` (all wildcard types)
  - `cli-fixtures/expand-expected-after-unknown.md`
  - `cli-fixtures/expand-expected-after-generic.md`
  - `cli-fixtures/expand-expected-after-all.md`
- [ ] Write `tests/expand.tryscript.md` golden session test:
  - Copy fixture, run `--expand`, diff to verify only unknown wildcards expanded
  - Restore, run `--expand-generic`, diff to verify generic + unknown expanded
  - Restore, run `--expand-all`, diff to verify all wildcards expanded
  - Verify expansion summary counts at each level
- [ ] Write `tests/expand-mutual-exclusion.tryscript.md` — verify flag conflicts error
- [ ] Write `tests/expand-no-change.tryscript.md` — verify `--expand` is a no-op when
  no unknown wildcards present

### Phase 3: Warning and Capture Log

Unknown wildcard warning and execution detail logging.

- [ ] Implement unknown wildcard counting (scan `expectedOutput` for `???` and `[??]`)
- [ ] Print warning after run if unknown wildcards present
- [ ] Write `tests/expand-warning.tryscript.md` — verify warning appears when `???`
  present in normal run
- [ ] Create `src/lib/capture-log.ts` with YAML generation
- [ ] Add `--capture-log <path>` option to run command
- [ ] Capture command, actual/expected output, exit codes, wildcard captures per block
- [ ] Include all wildcard categories (unknown, generic, named) in captures
- [ ] Write to YAML file atomically (using `atomically` library)
- [ ] Write tests for capture log output format

### Phase 4: Documentation

Every place that documents generic wildcards (`...`/`[..]`) must also document
unknown wildcards (`???`/`[??]`). The three wildcard categories and their preference
order must be clearly stated in both the README (brief) and the reference docs
(detailed).

#### Wildcard Categories and Preference Order

All wildcard documentation should present the three categories in this priority order:

1. **Named patterns** (`[HASH]`, `[CWD]`, etc.) — preferred; self-documenting, typed
2. **Unknown wildcards** (`???`, `[??]`) — temporary scaffolding, intended to be expanded
3. **Generic wildcards** (`...`, `[..]`) — last resort for genuinely unpredictable output

Literal text is always preferred over any wildcard.

#### Files to Update

**`README.md` (root) and `packages/tryscript/README.md`:**

These two files have near-identical content. Both need:

- [ ] Add a "Wildcard Patterns" section (replacing/expanding the current brief elision
  mention around line 87) that summarizes the three wildcard categories with a table and
  states the preference order (named > unknown > generic). Keep it brief — the README
  should give the summary, not the full reference.
- [ ] Update the Features bullet list (around line 111) to mention all three categories:
  `[HASH]`, `???`, `[??]`, `[..]`, `...`, `[CWD]`, `[ROOT]`, `[EXE]`
- [ ] Add `--expand`, `--expand-generic`, `--expand-all`, and `--capture-log` to the
  Common Options table
- [ ] Add a brief "Best Practice" note: always scaffold with `???`/`[??]`, run
  `--expand`, then replace dynamic values with named patterns. Generic wildcards are a
  last resort.

**`docs/development.md`:**

- [ ] Update the Elision Patterns table (lines 314-320) to include `???` and `[??]`
  alongside `...` and `[..]`, with a note that unknown wildcards are for scaffolding
  and should not be committed
- [ ] Add `--expand`, `--expand-generic`, `--expand-all`, `--capture-log` to the CLI
  Options table (lines 172-183)
- [ ] Add a brief "Wildcard Best Practices" subsection under "Writing Test Files"
  stating the preference order and recommended workflow

**`docs/tryscript-reference.md`:**

- [ ] Restructure the Elision Patterns section (lines 110-148) into three subsections:
  Named Patterns, Unknown Wildcards, and Generic Wildcards — in that preference order
- [ ] Add `???` and `[??]` to the pattern table with clear descriptions
- [ ] Add a "Wildcard Preference Order" subsection explaining: literal text > named
  patterns > generic wildcards, and that unknown wildcards are temporary scaffolding
- [ ] Add pattern examples for `???` and `[??]` alongside existing `...` and `[..]`
  examples
- [ ] Add `--expand`, `--expand-generic`, `--expand-all` to the Run Options table
  (lines 475-483)
- [ ] Add `--capture-log` to the Run Options table
- [ ] Add a "Wildcard Expansion" section covering the three flags, their hierarchy,
  and the recommended workflow (sketch with `???`, expand, review, pattern, commit)
- [ ] Add a "Capture Log" subsection documenting `--capture-log <path>` and the YAML
  format
- [ ] Update the Best Practices section (lines 737+) with guidance on wildcard choice
  and the expansion workflow
- [ ] Document that `???`/`[??]` are temporary scaffolding, intended to be expanded

#### General

- [ ] Update `--help` output for new flags
- [ ] Ensure all golden self-tests pass

## Open Questions

1. **Should expand flags and `--update` be mutually exclusive?**
   Proposed: Yes. They have different semantics (expand fills gaps, `--update` replaces
   everything). Running both would be confusing.

2. **Should expand flags modify files in place or write to a separate location?**
   Proposed: In place (same as `--update`). The user can use `git diff` to review
   changes, which is the expected workflow.

3. **Should we warn or error on `???`/`[??]`?**
   Proposed: Warn (not error). Tests with `???`/`[??]` still pass — they match like
   `...`/`[..]`. But a warning is printed nudging the author to run `--expand`. A
   future CI check could enforce that committed tests have no unknown wildcards.

4. **Capture log: YAML or JSON?**
   Proposed: YAML. More readable for human review; `yaml` package already a dependency.

5. **How should the expansion algorithm handle ambiguous matches?**
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
