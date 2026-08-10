---
'tryscript': minor
---

Ship a backward-compatible minor release after a full senior engineering review of
correctness, compatibility, diagnostics, documentation, packaging, and release safety.
No command, option, package export path, Node.js requirement, or valid v0.1.7 test-file
behavior is removed. Suites that depended on a false-positive result or malformed input
will now fail with an actionable diagnostic.

## Correct Results

- Rewrite duplicate blocks by source offset, so `--update` and `--expand` cannot rotate
  captured output between byte-identical blocks (#47).
- Report signal termination using the shell convention `128 + signal`, with signal
  numbers from the current platform instead of a Linux-only table.
- Match non-empty output consistently whether or not it ends in a newline.
- Reject a second `$` prompt and repeated or malformed `? ` lines with a located parse
  error instead of silently constructing a different command (#46).
- Reject executable fences that are unclosed or contain no `$ ` prompt instead of
  silently treating the file as having fewer tests.
- Parse CRLF-formatted continued commands without retaining carriage returns in the
  shell text, and preserve CRLF throughout blocks rewritten by update or expansion.
- Reject malformed or unclosed YAML frontmatter with file and line context. Treat
  non-executable Markdown fences as opaque so nested examples, headings, and annotations
  cannot create, rename, skip, or focus tests.
- Parse a bare `!` as an explicit empty stderr line, enforce it even when empty, and
  preserve it through rewrites (#45).

## Lossless Updates and Actionable Diagnostics

- Preserve `bash` fences and separate stdout/stderr assertions through `--update` and
  `--expand`, including blocks whose wildcard exists only on stderr.
- Keep legacy programmatic `TestBlock` values working without the new source metadata,
  but fail explicitly if stale content makes an edit impossible to locate. Validate
  supplied offsets against the exact source block before rewriting.
- Report each duplicate block's real line, validate project and frontmatter configuration,
  include dotted config paths in warnings, and label stderr diffs separately.
- Treat custom pattern replacements literally, including `$&`, `` $` ``, `$'`, and
  `$<` sequences.
- Keep later wildcard captures aligned when a custom regex contains its own capturing
  groups, namespace repeated named groups, preserve local backreferences, and keep
  legacy decimal escapes from binding to tryscript's wrappers. Warn when a custom name
  is reserved for a built-in, ignore it consistently during matching and expansion, and
  warn when `RegExp` flags retain the v0.1 source-only behavior.
- Keep wildcard-looking text inside `[ROOT]` and `[CWD]` literal, while treating path
  separators on those output lines portably.
- Include unknown stderr wildcards in the expansion warning count. Capture-log stdout
  and stderr independently when the test asserts them separately, and label each
  capture's stream.

## Compatibility and Hardening

- Load `tryscript.config.ts` through the packaged `tsx` runtime on Node.js 20, and honor
  project-level `tests` patterns when no files are passed on the command line.
- Preserve platform-native absolute `path` entries, including Windows drive-letter and
  UNC paths, instead of resolving them relative to the test file.
- Reject cyclic default-export wrappers in project config modules instead of hanging
  discovery.
- Warn about a null, primitive, or array project config and continue from an empty
  mapping instead of crashing during configuration merge.
- Reject fixture destinations that resolve outside the per-file sandbox.
- Sort discovered test paths before execution so reports and `--fail-fast` selection are
  deterministic across filesystems.
- Keep file arguments after repeatable coverage reporter and exclude options from being
  consumed as option values.
- Exclude unnamed blocks when `--filter` requests matching named tests.
- Emit `docs` and `readme` as exact source Markdown without ANSI styling. Their legacy
  `--raw` and `--color` options remain accepted as no-ops so existing commands continue
  to run.
- Bundle ESM-only runtime dependencies into CommonJS output, then pack the package and
  smoke-test every published entry point on the declared minimum Node.js 20.0.0 as well
  as the normal CI runtime.
- Preserve the v0.1.7 `CoverageContext` source shape while keeping concrete resolved
  options inside tryscript. Compile representative v0.1.7 consumers against both packed
  declaration formats under strict TypeScript settings.
- Restore the MIT `LICENSE` to the npm artifact, list it explicitly, make the smoke test
  use the publisher’s `npm pack` behavior, and compare the packed license byte for byte
  with the repository source.
- Replay the pinned v0.1.7 golden corpus against the candidate build. The release keeps
  108 assertions unchanged and limits differences to 16 reviewed snapshots of
  tryscript’s own help, documentation, warning, error, progress, and coverage text.
- Require an installed local `c8` for coverage instead of allowing a runtime package
  runner to download code, and invoke its JavaScript entry point through the current Node
  executable without platform-specific package-manager shell shims.
- Pin zero-install tooling outside the 14-day release cool-off, verify GitHub CLI
  downloads by checksum, use private temporary storage and atomic installation, disable
  dependency install scripts, and enforce audits in local, push, CI, and release gates.
- Resolve the remaining High-severity development-tool advisories with exact,
  source-reviewed package pins and package-specific cool-off exceptions while retaining
  the global 14-day gate for every other release.
- Adopt the current strict TypeScript and ESLint floor across source and tests, including
  maintained JavaScript tooling, TypeScript 6, exact optional properties, zero-warning
  checks, and atomic file writes.
- Derive development versions with argument-array Git execution and validated SemVer
  tags, and copy published documentation through a portable atomic Node script.

## CLI and Documentation

- Prefix warnings and errors consistently, make `--verbose` show captured output for
  passing tests, and return a failing exit status when a requested capture log or
  coverage report or external LCOV merge cannot be written. Coverage failures and
  partial execution-context setup now remove their temporary data, and cleanup I/O
  failures are no longer suppressed.
- Fail on a timed-out or non-zero setup or cleanup hook instead of silently accepting
  the hook, wait for timed-out process trees to terminate, and prevent test commands
  from running after failed setup.
- Surface coverage-statistics and verbose-reporter failures instead of reporting
  misleading zero coverage, preserve the final `c8` exit detail, and retain
  temporary-data cleanup.
- Honor project-configured `mergeLcov` before reporter selection, add the required LCOV
  output to either coverage command even when reporters were explicitly restricted, and
  fail the command when the merge cannot complete.
- Reject malformed LCOV numeric records with source-line context and merge coverage
  without mutating either caller-owned input. Serialize files, same-line functions,
  branches, and lines in a fully deterministic order.
- Make `tryscript docs` and `tryscript readme` emit source Markdown byte for byte for
  stable use by people, agents, and pipelines. The legacy `--raw` and `--color` options
  remain accepted as compatibility no-ops.
- Make source-mode documentation commands read tracked workspace files so they work in
  a clean checkout before the first build.
- Align the README, syntax reference, architecture, contributor runbooks, and Speculate
  templates with the current CLI and common documentation guidelines, and enforce those
  documents in pull-request CI. Format the maintained set with an exact,
  cool-off-eligible Flowmark release while excluding synchronized, generated,
  historical, and byte-exact Markdown.
- Run pull-request tests without repository write permission; transfer coverage data to
  a successful comment-only job and keep badge writes in the main-only job.
- Build, test, and pack releases in a read-only job, give npm OIDC authority only to the
  job that publishes the version-matched tarball, and create GitHub releases separately.
- Treat a child-process close event with neither an exit code nor a signal as an
  execution error instead of a successful command.
- Treat a downstream pager or pipeline closing stdout or stderr as a successful CLI
  termination while preserving every other stream failure.

## Public API

- Export `validateConfig`, `TestParseError`, and `ConfigWarning` for programmatic config
  validation and located parse-error handling.
- Keep every v0.1.7 named export and package export path. New `TestBlock` source metadata
  remains optional for callers that construct blocks directly.

## Migration

No migration is required for valid v0.1.7 test files or ordinary programmatic use.
Review these deliberate diagnostic changes when upgrading:

- Split multiple `$ ` prompts into separate executable fences, close every executable
  fence, and give each executable fence a command.
- Remove misspelled or stale configuration keys reported by the new validation warnings.
- Investigate newly failing signal, hook, stderr, fixture, capture-log, or coverage cases;
  v0.1.7 could report false success for those failures.
- Update snapshots only when they intentionally assert tryscript’s own CLI text. User
  command output and the `.tryscript.md` format otherwise remain compatible.
