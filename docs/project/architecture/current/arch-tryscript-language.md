# Tryscript Language Architecture

- **Status:** current
- **Last reviewed:** 2026-08-09

Tryscript executes shell commands embedded in Markdown and compares their results with
reviewable golden output.
This document describes the implementation boundaries and invariants maintainers must
preserve. For user-facing syntax and examples, see the
[tryscript reference](../../../tryscript-reference.md).

## Scope and Invariants

The language follows four core rules:

- Test files remain valid Markdown and executable blocks use `console` or `bash` fences.
- Commands run through the host shell; tryscript does not interpret command variables or
  shell operators.
- Wildcards apply only to expected output.
- Rewrites preserve all Markdown outside the selected block and preserve each block’s
  stream and fence semantics.

Backward compatibility is part of the parser contract.
Public `TestBlock` offset fields remain optional so callers written against v0.1.7 can
still construct blocks.
Malformed source is rejected when guessing would execute a command the author did not
write.

## Components

| Component | Path | Responsibility |
| --- | --- | --- |
| CLI orchestration | `src/cli/commands/run.ts` | Discover files, merge configuration, run blocks, report, rewrite, and collect coverage |
| Configuration | `src/lib/config.ts` | Load project configuration, apply defaults, and merge frontmatter |
| Parser | `src/lib/parser.ts` | Read frontmatter and executable fences into source-located blocks |
| Execution | `src/lib/runner.ts` | Build per-file contexts, run hooks and commands, capture streams, and clean up |
| Matching | `src/lib/matcher.ts` | Normalize output and compile wildcard expressions |
| Rewriting | `src/lib/block-writer.ts`, `updater.ts`, `expander.ts` | Serialize and atomically splice selected blocks |
| Coverage | `src/lib/coverage.ts`, `lcov.ts` | Collect V8 data through local c8 and merge LCOV reports |
| Reporting | `src/lib/reporter.ts`, `capture-log.ts` | Render results, diffs, summaries, and capture logs |

## Runtime Pipeline

One `tryscript run` invocation follows this sequence:

1. Load the first project configuration found in the process working directory.
2. Select CLI file arguments, configured `tests` patterns, or `**/*.tryscript.md`, in
   that order.
3. Parse each file’s YAML frontmatter and executable blocks.
   Malformed YAML is a located parse failure; schema validation produces non-fatal
   warnings with dotted paths.
4. Merge project configuration with frontmatter.
   Frontmatter wins, except fixtures are appended and frontmatter `path` entries are
   prepended.
5. Create one execution context and temporary directory per test file.
6. Run and match selected blocks in source order, capturing combined output, stdout,
   stderr, exit status, and duration.
7. Run the file’s `after` hook and remove its temporary execution directory.
8. Report results and optionally update output, expand wildcards, or write a capture
   log.
9. Generate requested coverage and remove its temporary data.

`--filter` selects only named blocks whose names match its regular expression; unnamed
blocks are excluded while filtering.
`--fail-fast` stops before the next block or file after a failure.
Parse failures count toward the final non-zero exit even though they produce no block
result.

## Test File Grammar

The parser recognizes unindented backtick fences whose info string is exactly `console`
or `bash`. An opening fence may contain three or more backticks; its closing fence must
use at least the same number.
Longer fences allow expected output to contain shorter Markdown fences.
Other backtick and tilde fences are opaque, so executable-looking examples, headings,
and annotations nested inside documentation cannot affect tests.

Within one executable block:

```text
$ command [arguments]       required; exactly one per block
> continuation              appended to the active command
expected output             stdout or combined output
! expected error            stderr, when streams are asserted separately
!                            explicit empty-stderr assertion
? 2                          expected non-negative exit status; defaults to 0
```

An unclosed executable fence, a fence without a `$ ` prompt, a second prompt, a repeated
`? ` line, or a non-integer exit status is a located parse error.
A bare `?` is ordinary expected output.
CRLF carriage returns are removed from block lines before token parsing, so continued
commands have the same shell text under either repository line-ending style.
Top-level headings provide block names; top-level `<!-- skip -->` skips a block and
`<!-- only -->` restricts execution to annotated blocks.
Text inside any fence is block content, never metadata for a later test.

The parser records opening and closing byte offsets, the original fence info string, and
the raw block. These values are the authority for later rewrites.

## Configuration and Discovery

Project configuration is loaded from the first existing file in this order:

1. `tryscript.config.ts`
2. `tryscript.config.js`
3. `tryscript.config.mjs`

TypeScript configuration is loaded through the packaged `tsx` runtime, including on the
minimum supported Node.js 20 release.
`defineConfig()` provides type inference but does not mutate the configuration.
JavaScript and TypeScript project configs also receive the same non-fatal runtime
validation warnings as frontmatter.
A null, primitive, or array project config is normalized to an empty mapping after its
warning because it cannot participate in configuration merge.
Cyclic default-export wrappers are rejected with the configuration path instead of being
unwrapped indefinitely.

The project-wide `tests` field controls discovery only when the command has no explicit
file arguments. Frontmatter cannot affect discovery because a file must be discovered
before its frontmatter can be read.
Matched absolute paths are sorted ordinally before execution so reporting and
`--fail-fast` selection do not depend on filesystem order.

| Option | Merge or runtime behavior |
| --- | --- |
| `cwd` | Resolved from the test file directory; frontmatter replaces project config |
| `sandbox` | `true` creates an empty sandbox; a path copies that directory into one |
| `fixtures` | Project and frontmatter lists are concatenated, then copied only in sandbox mode; lexical and symbolic-link checks keep destinations inside the sandbox root |
| `env` | Maps are merged; frontmatter keys win |
| `path` | Frontmatter entries precede project entries, then the process `PATH` |
| `before`, `after`, `timeout` | Frontmatter replaces the project value when present |
| `patterns` | Maps are merged; frontmatter names win |

`tests` and `coverage` are project-level CLI settings.
File discovery and the shared coverage collector are initialized before per-file
frontmatter is applied.

Configuration is validated with strict Zod schemas.
Unknown keys and type mismatches are warnings rather than hard errors so previously
runnable files remain runnable.
Valid mapping values are retained for compatibility; validation does not silently
rewrite their nested fields.

## Execution Context

Commands use `child_process.spawn(command, { shell: true })`. Pipes, redirects, quoting,
and command-variable expansion therefore follow the host shell.
Each file has one context, so its blocks share the same working directory and filesystem
state.

Working-directory selection is:

| Configuration | Command working directory |
| --- | --- |
| no `cwd` or `sandbox` | Test file directory |
| `cwd: path` | `path` resolved from the test file directory |
| `sandbox: true` | Fresh empty temporary directory |
| `sandbox: path` | Fresh temporary directory populated from `path` |

Fixtures are resolved from the test file directory and copied into an enabled sandbox.
The `before` hook runs once before the first non-skipped block.
The `after` hook runs once after selected blocks, and context cleanup runs in a
`finally` path. A timeout or non-zero hook exit fails the run.
A failed `before` attempt is retained on the execution context so later blocks cannot
run without successful setup.

Tryscript begins with the process environment, overlays configured values and coverage
state, disables color for deterministic output, and adds these derived variables when
their roots exist:

- `TRYSCRIPT_TEST_DIR`
- `TRYSCRIPT_PACKAGE_ROOT`
- `TRYSCRIPT_GIT_ROOT`
- `TRYSCRIPT_PROJECT_ROOT`
- `TRYSCRIPT_PACKAGE_BIN`

Configured `path` entries expand built-in and process environment variables, preserve
absolute entries according to the host platform, resolve relative entries from the test
file directory, and precede the process `PATH`.

The command timeout defaults to 30 seconds.
A timeout kills the spawned process tree and settles only after the termination request
completes; a termination failure is preserved as the cause of an execution error.
Node reports a signal exit with `code === null`; tryscript maps it to the shell
convention `128 + signal number` using the current platform’s signal table.
An unknown platform signal is an execution error, never a successful exit.
A close event that supplies neither an exit code nor a signal is also an execution
error.

## Output and Wildcards

When a block contains no `!` lines, expected output is compared with the interleaved
stdout/stderr chunks observed by the parent process.
When a block contains `!` lines, stdout and stderr are normalized, matched, diffed, and
expanded independently.

Normalization removes ANSI escapes, converts line endings to `\n`, trims trailing
whitespace on each line, and treats zero or more final newlines as one.
Empty output remains empty.
Lines containing `[ROOT]` or `[CWD]` treat `/` and `\` as equivalent path separators
without changing captured output.

Wildcard precedence is implemented with unique private-use markers before literal text
is regex-escaped:

| Category | Single line | Complete lines | Purpose |
| --- | --- | --- | --- |
| Unknown | `[??]` | `???` | Temporary scaffold that should be expanded and reviewed |
| Generic | `[..]` | `...` | Intentional omission of unstable output |
| Named | `[NAME]` | Not applicable | Configured regular expression with domain meaning |

`[ROOT]` and `[CWD]` are resolved path tokens, while `[EXE]` is `.exe` on Windows and
empty elsewhere. Resolved path text is protected before wildcard scanning, so `[..]` or
`[??]` inside a real directory name remains literal.
Replacement callbacks insert custom regex source literally, preventing JavaScript
replacement tokens such as `$&` from corrupting a pattern.

Each outer wildcard receives a generated named capture.
Named groups inside a custom pattern are namespaced per occurrence, and valid numeric
backreferences are offset to their local groups.
Legacy decimal escapes are rewritten explicitly so wrapper groups cannot reinterpret
them as backreferences.
Custom names reserved for built-in tokens are ignored with a configuration warning.
`RegExp` values retain the v0.1 source-only contract: flags produce a configuration
warning and are not embedded.

The expansion hierarchy is `unknown` < `generic` < `all`. An expansion runs only after
the entire expected expression matches actual output, so it cannot fill an unrelated or
already failing block.

## Rewrites and Capture Logs

Update and expansion operations build replacements in memory, sort edits by descending
source offset, and write the final file atomically.
This keeps earlier offsets stable and correctly handles byte-identical blocks.
Legacy programmatic blocks without offsets use ordered raw-content lookup and throw if
their source is stale.
Programmatic blocks with offsets must provide both boundaries, and the exact source
slice must still equal the block’s raw content; invalid or stale locations fail before
any write.

Serialization preserves the original fence width, `console` or `bash` info string,
line-ending style, separate stderr mode, and explicit exit status.
Passing, filtered-out, skipped, and execution-error blocks are not updated.

Capture logs are YAML sidecars containing commands, expected and actual values, match
results, and wildcard captures.
A block with separate stderr assertions records `expected_stderr` and `actual_stderr`;
every capture from that block identifies its `stdout` or `stderr` stream.
Stable field ordering keeps diffs reviewable.
Warnings and CLI failures use stable `Warning:` and `Error:` prefixes on stderr;
machine-readable final summaries remain on stdout.
The binary treats `EPIPE` on stdout or stderr as a normal downstream pipe closure and
exits successfully; other stream errors remain fatal.

## Coverage

Coverage mode creates a temporary `NODE_V8_COVERAGE` directory shared by spawned test
commands and invokes an already-installed local `c8` JavaScript entry point through the
current Node executable with `shell: false`. This avoids platform-specific
package-manager shell shims.
Tryscript never invokes a download-capable package runner at runtime.
An effective `mergeLcov` value from the CLI or project config enables the LCOV reporter
before c8 runs. External LCOV can then be merged into generated LCOV, after which
`coverage-summary.json` is regenerated.
Numeric LCOV records are validated with input and line context.
Merging deep-clones each file’s line, function, and branch values so caller-owned
reports remain unchanged.
Serialization sorts source paths, same-line functions, branches, and lines with complete
tiebreakers so equivalent input produces byte-identical LCOV.

Coverage errors are reported separately from test failures, and temporary data is
removed in a `finally` path.
The user-facing limitations and collector differences are documented in the
[coverage reference](../../../tryscript-reference.md#code-coverage).

## Verification Boundaries

Unit tests cover parsing, normalization, matching, expansion, rewriting, configuration,
coverage helpers, and process exit mapping.
Integration and golden tests exercise CLI text and real shell behavior.
The packed-package smoke test installs the npm-compatible archive as a consumer,
verifies its license, compiles strict legacy consumers against both declaration formats,
and exercises ESM, CommonJS, both CLI bundles, and a typed configuration on the minimum
Node.js runtime. The compatibility smoke test replays the pinned v0.1.7 corpus and
rejects any difference outside the reviewed CLI-text allowlist.

Any change to parsing or rewriting must add a source-level regression.
Any change to a public CLI description must update the CLI golden file.
Packaging changes must pass the consumer smoke test, not only workspace imports.

## Future Considerations

### Open Questions

There are no unresolved language-contract questions for v0.2.0. Fresh dependency
exceptions are release governance decisions, not language architecture.

### Potential Improvements

- Optional startup diagnostics remain tracked in bead `try-1hjf` and
  [GitHub issue #44](https://github.com/jlevy/tryscript/issues/44).
- Safe regeneration of Codex helper scripts remains tracked in bead `try-pn34`; the
  reviewed local pins intentionally differ from the current tbd generator output.

## References

- [Tryscript reference](../../../tryscript-reference.md)
- [Development guide](../../../development.md)
- [Node.js child process events](https://nodejs.org/api/child_process.html#event-close)
- [Node.js signal constants](https://nodejs.org/api/os.html#signal-constants)
- [CommonMark fenced code blocks](https://spec.commonmark.org/current/#fenced-code-blocks)
- [v0.2.0 stability review](../../specs/active/spec-v0.2.0-stability-review.md)

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
