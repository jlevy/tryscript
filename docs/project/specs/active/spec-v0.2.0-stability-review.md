# Stability Review for tryscript v0.2.0

**Status:** active **Baseline:** v0.1.7 (`1aa7ecd`) **Date:** 2026-08-09

A full review of tryscript’s correctness, ergonomics, public compatibility, packaging,
documentation, and dependency posture, to decide the next release boundary and what it
should contain.

**Conclusion: ship v0.2.0 as a backward-compatible minor release.** The review found 12
initial defects, 5 of which cause tryscript to report a *wrong* result — the worst class
of bug for a testing tool, because the failure is silent.
The remediation also adds public validation exports and makes documented CLI
capabilities reliable.
Valid test files that pass on v0.1.7 remain compatible.

**Implementation status:** B1-B12, D1-D52, and D54-D56 are complete at the current local
head. Quality, documentation, unit, golden, package, compatibility, minimum-runtime,
coverage, and both production and full-audit gates pass.
The exact fresh-security-fix exceptions have completed human and artifact review.
D53 remains in progress while the PR is updated and CI runs; the release stays draft
until the local commits are pushed and terminal CI is green.

## Backward Compatibility Contract

Every change here obeys one rule: **a valid `.tryscript.md` file that passes on v0.1.7
must still pass on v0.2.0.** Fixes therefore fall into three safe shapes:

- Tests that wrongly *failed* now pass (B3).
- Tests that wrongly *passed* now fail (B2) — a false pass is not behavior worth
  preserving, and this is called out in the release notes.
- Files that were silently misinterpreted now produce a parse error at author time,
  never a changed result (B4).

The one deliberate hard error is B4 (multiple prompts per block).
It cannot be a warning: the current behavior builds a command nobody wrote, so anything
short of rejecting it leaves the hazard in place.
Issue #46 requests exactly this.

## Findings

Severity: **S1** silently wrong result · **S2** data loss or corruption on write ·
**S3** misleading output · **S4** friction.

| ID | Sev | Summary | Site | Issue |
| --- | --- | --- | --- | --- |
| B1 | S1 | `--update`/`--expand` write captured output into the wrong duplicate block | `updater.ts:40`, `expander.ts:189` | #47 |
| B2 | S1 | Signal-killed command reports exit code 0, so the test falsely passes | `runner.ts:317` | new |
| B3 | S1 | Output with no trailing newline can never match, and `--update` cannot fix it | `matcher.ts:127` | new |
| B4 | S1 | Two `$` prompts in one block silently concatenate into one command | `parser.ts:161-199` | #46 |
| B5 | S1 | Bare `!` line is parsed as stdout, so blank stderr lines are inexpressible | `parser.ts:173` | #45 |
| B6 | S2 | `--update`/`--expand` discard `!` stderr assertions, weakening the test | `updater.ts:61`, `expander.ts:176` | new |
| B7 | S2 | `--update`/`--expand` rewrite `bash` fences as `console` | `updater.ts:70`, `expander.ts:181` | new |
| B8 | S3 | Duplicate blocks all report the first block’s line number | `parser.ts:107` | new |
| B9 | S3 | Non-numeric `? ` yields `NaN` with no parse error | `parser.ts:171` | new |
| B10 | S3 | Failure diff shows combined output when stderr is asserted separately | `run.ts:294` | new |
| B11 | S3 | Custom pattern containing `$&`, `` $` ``, or `$'` is corrupted | `matcher.ts:88,238` | new |
| B12 | S4 | Frontmatter is never validated; typo’d keys are silently ignored | `parser.ts:94` | new |

### B1 — Wrong block updated (#47)

`updater.ts` and `expander.ts` both locate the block to rewrite with
`content.indexOf(block.rawContent)`. When two blocks have byte-identical source,
`indexOf` returns the *first* one regardless of which block the result belongs to.
Processing in reverse then rotates outputs among the duplicates.

Reproduced: a file that writes `first`, reads it, writes `second`, reads it.
After `--update` the first read block claims `second` and the second claims `first` —
exactly inverted, and the file then passes, cementing the wrong golden.

**Fix:** record each block’s source `startOffset`/`endOffset` in the parser and splice
by offset. This removes the ambiguity rather than narrowing it, as #47 recommends.

### B2 — Signal-killed command falsely passes

`proc.on('close', (code) => ... exitCode: code ?? 0)`. When the spawned shell is
terminated by a signal, `code` is `null` and `signal` holds the name, so tryscript
records **0**. A command killed by SIGKILL is reported as a clean success.

Reproduced: `$ kill -KILL $$` against `? 99` reports “got 0”. A real shell reports 137.

**Fix:** follow the shell convention and report `128 + signal` when `code === null`.

### B3 — Output without a trailing newline can never match

`normalizeOutput` collapses trailing newlines with `.replace(/\n+$/, '\n')`, which
normalizes *one or more* to one but leaves *zero* alone.
The parser, meanwhile, always terminates `expectedOutput` with `\n`. So any CLI that
writes its last line without a trailing newline is untestable.

This is the worst of the set for users because `--update` does not rescue them: it
writes back the identical text and the block still fails, with a diff that renders as
identical lines. Reproduced with `process.stdout.write('no-trailing-newline')`.

**Fix:** `.replace(/\n*$/, '\n')` on non-empty output.
Strictly widens what matches, so no passing test changes.

### B4 — Multiple prompts concatenate (#46)

`parseBlockContent` pushes every `$ ` line into `commandLines` and joins them with a
space. Two intended invocations become one, with the second as arguments to the first.
Reproduced: two `node -e` prompts produced only `A`; the second never ran.

**Fix:** reject a second `$ ` prompt with a parse error naming the file and line, and
pointing the author at a separate fence.

### B5 — Blank stderr lines inexpressible (#45)

The parser tests `line.startsWith('! ')`, so a bare `!` falls through to stdout.
Writing `! ` with a trailing space works only until an editor, formatter, or
`git diff --check` strips it.

**Fix:** treat a line equal to `!` as an empty stderr line.

### B6/B7 — Lossy rewrites

`buildUpdatedBlock` reconstructs a block from `command` + `actualOutput` + exit code
only. Two things are dropped:

- **B6:** `!`-prefixed stderr assertions.
  A block that asserted stdout and stderr separately is rewritten as a single
  combined-output block.
  It passes afterward, so the weakening is invisible — the test no longer checks what it
  was written to check.
- **B7:** the fence info string.
  `bash` becomes `console`.

**Fix:** preserve the info string, and re-emit `!` lines from `actualStderr` whenever
the block asserted stderr separately.

### B8-B11 — Misleading diagnostics

- **B8:** `lineNumber` uses `content.indexOf(codeBlock.fullMatch)` — the same duplicate
  hazard as B1. Two identical blocks both report “Line 1”. Fixed for free by the B1
  offset work.
- **B9:** `parseInt('three')` yields `NaN`, and the block reports “Expected exit code
  NaN”. Should be a parse error.
- **B10:** when `expectedStderr` is set the comparison uses stdout only, but the diff is
  built from `result.actualOutput` (combined), so stderr lines appear as phantom
  additions.
- **B11:** markers are substituted with `regex.replaceAll(marker, replacement)`. A
  replacement string containing `$&`, `` $` ``, `$'`, or `$<` is interpreted by
  `replaceAll`’s substitution rules instead of inserted literally.
  Verified: a custom pattern of `\$&` fails to match the text it describes, while the
  same pattern without `$` matches.
  Fixed by passing a function replacement.

### B12 — Frontmatter is never validated

`TestConfigSchema`, `FixtureSchema`, and `CoverageConfigSchema` are defined in
`types.ts` and used **only** for `z.infer`. No `.parse()` or `.safeParse()` call exists
anywhere in the source.
`parseTestFile` does `parseYaml(yamlContent) as TestConfig` — an unchecked cast.
A typo like `sandbox: ture` or `timout: 5000` is silently ignored and the test runs with
surprising defaults.

**Fix:** validate frontmatter with `safeParse` and emit warnings for unknown keys and
type mismatches. **Warnings, not errors** — an existing file with a stray key must keep
running.

Note the consequence for the dependency graph: because the schemas are only used for
types, `zod` is tree-shaken out of the bundle entirely (`grep -c zod dist/bin.mjs` → 0)
while remaining a declared runtime dependency every consumer installs.
Wiring up validation makes that dependency honest.

## Pull Request Remediation Review

The implementation received a second full review at PR #48. That review preserved the
original B1-B12 design while closing additional release blockers:

- Signal exit values now use Node’s platform signal table rather than hard-coded Linux
  numbers.
- Nested fixture and coverage validation reports precise dotted paths, and the CLI keeps
  those paths in its warning output.
- Wildcard expansion handles stderr-only blocks, including an explicit empty-stderr
  assertion represented by a bare `!`.
- The source-offset metadata added for B1 remains optional for programmatic consumers;
  legacy blocks fall back to content lookup and fail explicitly when stale content
  cannot be located.
- Stale `bin` frontmatter was removed from the maintained golden files and
  documentation.
- CommonJS output bundles its ESM-only runtime dependencies; a packed-artifact consumer
  test exercises it and every other published entry point on the declared minimum
  Node.js 20.0.0.
- GitHub CLI bootstrap scripts use private temporary directories, pinned checksums, and
  an atomic final rename.
  The implementation was tested with a real isolated install.
- Internal block serialization helpers are no longer added to the package root API.
- Runtime `npx c8` fallback was removed; coverage requires a locally installed `c8`.
- TypeScript 6, the strict type-aware ESLint presets, exact optional properties, atomic
  writes, verify-only CI, pinned local hook tools, and advisory gates bring the branch
  to the current tbd TypeScript and supply-chain floor.

The published review and its finding-by-finding disposition are part of the PR record.
The tbd 0.4.2 generator currently restores the unsafe executable versions when it
refreshes Codex helpers, so the reviewed local scripts intentionally differ from its
managed template and `tbd doctor` reports that divergence.
Regression tests protect the local pins; upstream generator work is tracked as
`try-pn34`.

### Documentation, CLI, and Release Contract Pass

Reconciling every maintained document and user-facing help string with the
implementation found fifty-six more contract and release defects.
Each is tracked under the PR remediation parent bead:

| ID | Defect | Resolution | Bead |
| --- | --- | --- | --- |
| D1 | Documented `tryscript.config.ts` files fail on Node.js 20 | Package the aged `tsx` runtime and smoke-test a typed config through both CLI bundles | `try-jcm5` |
| D2 | Project-level `tests` patterns are defined but ignored | Load config before discovery and test the CLI-argument/config/default precedence | `try-f9cx` |
| D3 | Capture-log and coverage-report failures still exit 0 | Count requested-artifact failures in the final process status | `try-ge6b` |
| D4 | `run --verbose` has no effect | Print captured output for passing blocks and lock the behavior in the CLI golden suite | `try-opve` |
| D5 | The two documentation commands duplicate a fence parser that misreads nested Markdown | Share one renderer that tracks CommonMark fence character and width; make `--raw` override color | `try-ozkr` |
| D6 | Coverage report failures call `process.exit()` before temporary data cleanup | Set the deferred exit status, return through `finally`, and assert the reported directory is removed | `try-d8qb` |
| D7 | A fixture-copy failure leaks the execution directory created before context setup | Remove partial contexts on every initialization error and retain both errors if cleanup also fails | `try-6k2i` |
| D8 | Non-zero `before` and `after` hooks are silently treated as successful | Fail with the hook’s exit and output, prevent commands after failed setup, and preserve cleanup on every error path | `try-7f7u` |
| D9 | Executable project configs bypass the frontmatter runtime validation | Emit the same dotted-path, non-fatal warnings before project patterns or options are consumed | `try-s14c` |
| D10 | Unclosed or commandless executable fences silently remove intended tests | Reject each malformed fence with its source file and opening line | `try-u0nx` |
| D11 | Windows absolute `path` entries are treated as relative | Detect absolute paths with the host platform’s path rules and retain them unchanged | `try-fy5m` |
| D12 | A missing external LCOV file logs an error but exits successfully | Route merge failures through the requested-artifact failure count and retain temporary cleanup | `try-ltfy` |
| D13 | Glob matches execute in arbitrary filesystem order | Sort unique absolute paths ordinally before execution so reports and `--fail-fast` are reproducible | `try-6r16` |
| D14 | Coverage cleanup suppresses permission and I/O failures | Let forceful removal ignore an absent path while propagating every real cleanup error | `try-5qfo` |
| D15 | A fixture destination can escape the temporary sandbox | Resolve and validate containment before every fixture copy | `try-ss51` |
| D16 | Variadic coverage options consume the following test-file argument | Use repeatable single-value options so documented commands preserve positional files | `try-2m6y` |
| D17 | `--filter` still runs every unnamed block | Select only named blocks whose names match the requested expression | `try-rrab` |
| D18 | Commander argument failures use a different error prefix | Normalize built-in parse failures to the same `Error:` contract as runtime failures | `try-4edz` |
| D19 | The maintained-document check is omitted from pull-request CI | Run the shared format, docs, type, and lint quality gate in the workflow | `try-axy1` |
| D20 | Pull-request tests execute with repository write permission | Keep tests read-only, transfer coverage as an artifact, and comment from a successful write-scoped job | `try-52m2` |
| D21 | Release build, tests, and GitHub release creation share npm OIDC authority | Verify and pack read-only, publish only the version-matched tarball with OIDC, and create the GitHub release in a separate job | `try-5ksi` |
| D22 | Source-mode documentation commands depend on ignored build copies | Read tracked workspace docs in source mode and packaged copies from built distributions | `try-q9me` |
| D23 | Unknown wildcards on expected stderr are omitted from the warning count | Count both asserted streams and cover stderr expansion in the golden suite | `try-0h23` |
| D24 | Cyclic config-module default exports hang discovery | Detect wrapper cycles and report the exact project config path | `try-y0sx` |
| D25 | Timed-out commands settle before asynchronous process-tree termination | Wait for tree termination and surface termination failures | `try-cy53` |
| D26 | Malformed or unclosed YAML frontmatter escapes located parse handling | Wrap YAML failures with file, line, and cause; reject an opening delimiter without a close | `try-gbwa` |
| D27 | Capture groups inside a custom pattern shift later wildcard captures | Address every outer wildcard capture by a stable generated name | `try-rxpn` |
| D28 | Build-version Git tags are interpolated into shell commands | Execute Git with argument arrays and reject non-SemVer tags before reuse | `try-a6zl` |
| D29 | Package documentation copying depends on POSIX `cp` and `mkdir` | Copy tracked docs through a cross-platform atomic Node script | `try-fo3k` |
| D30 | Coverage filesystem and verbose-reporter failures are suppressed | Propagate I/O and reporter failures, retain cleanup, and share the LCOV merge implementation | `try-v3ur` |
| D31 | Executable-looking examples inside outer Markdown fences run as tests | Treat non-executable fences as opaque until the matching CommonMark close | `try-pl28` |
| D32 | Headings and annotations inside fenced content rename, skip, or focus later tests | Track names and annotations only while scanning top-level Markdown | `try-jftw` |
| D33 | Stale explicit block offsets can overwrite unrelated Markdown | Require complete, integral, in-range offsets whose source matches the parsed block | `try-frsa` |
| D34 | Malformed LCOV becomes `NaN`, and merging mutates caller-owned input | Validate numeric records with source-line context and deep-clone all merged values | `try-7x5m` |
| D35 | Configured or explicitly filtered LCOV merging can omit its required reporter, and merge failures exit successfully | Resolve the effective merge before reporters and fail requested-artifact errors | `try-netv` |
| D36 | A null, primitive, or array project config reaches object spread and crashes discovery | Warn, then normalize an invalid top-level project config to an empty mapping | `try-mw1s` |
| D37 | Capture logs match combined output even when stdout and stderr are asserted separately | Record both streams independently and identify each capture’s stream | `try-key1` |
| D38 | `docs --raw` and `readme --raw` append a byte not present in the source document | Write raw Markdown without a synthetic newline and compare output byte for byte | `try-hgih` |
| D39 | A process close event with neither an exit code nor a signal is reported as success | Treat the impossible status as an execution error | `try-f5md` |
| D40 | Embedded custom regex backreferences can bind to tryscript’s wrapper groups | Namespace named groups, offset local references, preserve legacy escapes, and warn on ignored flags or built-in names | `try-ctf6` |
| D41 | Wildcard-looking path components inside `[ROOT]` or `[CWD]` become active wildcards | Protect resolved paths and make path-token line separators portable | `try-3gvb` |
| D42 | CRLF carriage returns remain inside continued shell commands | Strip the line terminator before parsing command and expected-output tokens | `try-somq` |
| D43 | Coverage launches a package-manager shell shim directly, which is not portable to Windows | Resolve the installed c8 JavaScript entry point and run it through the current Node executable without a shell | `try-n1m5` |
| D44 | Reserved custom-pattern names are ignored by matching but still crash `--expand-all` | Exclude built-in names from expansion with the same shared reserved-name set | `try-ydwi` |
| D45 | Rewriting a CRLF test block produces mixed line endings and drops the closing fence carriage return | Keep the closing terminator outside source offsets and serialize with the block’s original line ending | `try-sczq` |
| D46 | Prettier excludes Markdown, but no formatter or CI gate owns maintained docs | Pin `flowmark-rs`, separate generated and byte-exact files through `.flowmarkignore`, auto-fix at commit, and verify the maintained set in CI | `try-38ck` |
| D47 | Closing a pager or downstream pipe can surface `EPIPE` as a CLI crash | Exit successfully for closed stdout or stderr pipes while rethrowing every other stream error | `try-u241` |
| D48 | LCOV serialization retains input order for files and branches and has no same-line function tiebreaker | Sort every record type with complete ordinal and numeric comparison chains | `try-9auf` |
| D49 | The package smoke test uses pnpm’s workspace-aware pack behavior, masking an npm artifact without `LICENSE` | Exercise `npm pack`, list and synchronize the package-root license explicitly, and compare the packed bytes with the repository source | `try-h4p8` |
| D50 | The exported `CoverageContext` narrows a v0.1.7 TypeScript input shape | Preserve the published shape, keep a concrete internal context, and compile legacy consumers against both packed declaration formats | `try-ivh7` |
| D51 | Release validation has no executable comparison with the published baseline | Replay the pinned v0.1.7 corpus and permit only the 14 reviewed tryscript CLI snapshot changes | `try-pxy0` |
| D52 | A patch changeset understates additive public exports and user-visible CLI capabilities | Prepare v0.2.0 as a backward-compatible minor release with explicit migration guidance | `try-oe1p` |
| D53 | PR metadata and fixed-issue bookkeeping no longer describe the reviewed branch | Reconcile the title, body, linked issues, review disposition, validation evidence, and release boundary before ready-for-review | `try-7ctq` |
| D54 | The compatibility replay inherits `GIT_DIR` and related state from pre-push hooks, so its archived repository loses Git-root behavior | Remove inherited `GIT_*` variables from every baseline subprocess and reproduce the hook environment in a regression run | `try-3z3e` |
| D55 | The first security override covers only root ESLint’s minimatch path, and separate js-yaml exception entries do not satisfy pnpm’s exact multi-version syntax | Cover c8’s workspace-local minimatch edge, use pnpm’s documented version disjunction, and verify both dependency graphs plus the full audit | `try-0a09` |
| D56 | ESLint traverses the gitignored attic used for third-party source review and loads foreign project configuration | Add the attic to the flat-config global ignores so external review material cannot alter repository quality gates | `try-datx` |

The documentation pass makes exact `flowmark-rs==0.3.2` formatting authoritative for the
18 maintained documents and adds a repository check for local links, H1 structure, and
the common-doc footer across that same set.
Product docs, contributor runbooks, architecture, templates, CLI help, and executable
examples now describe the present behavior.
Maintained JavaScript tooling receives the same typed promise-safety lint and `tsc`
floor as TypeScript.
Generated cross-project snapshots and completed historical specs retain their original
ownership and chronology.

## Release Compatibility Assessment

The release is a **minor v0.2.0**, not a patch, because it adds public validation
exports and makes documented CLI capabilities available and reliable.
It is not a major release:

- No command, option, package export path, engine requirement, or v0.1.7 named export is
  removed.
- Valid v0.1.7 test files remain supported.
  Inputs that relied on a false pass or malformed executable syntax now fail
  deliberately with a located diagnostic.
- Representative v0.1.7 `CoverageContext`, `TestBlock`, and `TryscriptConfig` consumers
  compile against both packed CommonJS and ESM declarations with strict
  optional-property checks.
- The pinned v0.1.7 corpus retains 110 assertions; the 14 reviewed differences snapshot
  tryscript’s own improved help, warning, error, progress, and coverage text.
- The packed artifact retains the v0.1.7 file count and MIT license while adding working
  CommonJS output and synchronized user documentation.

The migration section in the changeset lists every case that can require user action.
There are no known unintentional runtime, CLI, package, or TypeScript source breaks.

## Deferred

- **#44 (startup timing diagnostics)** — a feature, not a fix.
  Out of scope for v0.2.0; the per-command duration is already collected in
  `TestBlockResult.duration`, so a `--timings` summary is a small follow-up.
- **Runtime major bumps** — `zod` 3→4 (the `z.record` signature changed and would break
  `TestConfigSchema`), `commander` 14→15, `diff` 8→9. Each needs its own compatibility
  pass; none carries a security advisory at the version in use after this release.

## Dependency and Supply-Chain Review

Reviewed against
[supply-chain-hardening](https://github.com/jlevy/supply-chain-hardening)
(`SUPPLY-CHAIN-SECURITY.md` install rules, `guidelines/hardening-npm.md`).

**Cool-off:** 14 days.
Cutoff for this review is **2026-07-26**. The initial dependency pass selected only
versions published on or before that date.
The final PR audit found new High-severity advisories whose only complete fixes were
published after the cutoff.
Each exact artifact received the required source and supply-chain review before a
package-specific exception was approved.
The global 14-day gate remains unchanged.

Held back by cool-off (newest release too young, pinned lower):

| Package | Newest | Published | Pinned | Published |
| --- | --- | --- | --- | --- |
| `typescript-eslint` | 8.66.0 | 2026-08-03 | 8.65.0 | 2026-07-20 |
| `publint` | 0.3.23 | 2026-08-04 | 0.3.22 | 2026-07-23 |
| `tsx` | 4.23.11 | 2026-08-07 | 4.23.1 | 2026-07-13 |

**Advisories.** `pnpm audit` reported 43 findings.
Two touch the published runtime dependency tree; the rest are dev-only (eslint,
vitest/vite, changesets, tsdown).

- `diff` — GHSA-73rr-hh4g-fpgx, DoS in `parsePatch`/`applyPatch`. Patched in 8.0.3.
  Resolved version was 8.0.2, and tryscript calls `createPatch` on every failure diff.
  Bumped to `^8.0.4`.

- `yaml` — advisory against the resolved 2.8.2. Bumped to `^2.9.0`.

- `picomatch` — GHSA-c2c7-rcm5-vvqj (ReDoS via extglob) and GHSA-3v7f-55p6-f55p (method
  injection in POSIX character classes), both patched in 2.3.2. Reached through
  `fast-glob` → `micromatch` → `picomatch`. `micromatch` already allows `^2.3.1`, but
  resolution stuck at 2.3.1 and `pnpm update --depth Infinity` did not move it, so a
  `micromatch>picomatch` override pins exact version 2.3.2. The override is scoped so
  the unrelated `picomatch` 4.x used by the build tooling is untouched.

After the eligible updates and scoped overrides, `pnpm audit --prod` reports no known
runtime vulnerabilities.
The full audit was reduced to eight reports across three dev-tool transitive package
families, all with fresh-only fixes:

| Package family | Exact fixes | Eligible without exception | Advisory impact |
| --- | --- | --- | --- |
| `brace-expansion` | 5.0.9 | 2026-08-13 | High, unbounded expansion DoS |
| `js-yaml` | 3.15.1, 4.3.1 | 2026-08-14 | High, quadratic ordered-map CPU consumption |
| `nanoid` | 3.3.17 | 2026-08-17 | High, zero-size custom-generator infinite loop |

None enters the published tryscript runtime.
`brace-expansion` is reached only through ESLint and minimatch.
`js-yaml` is reached only through Changesets and is not invoked by the pull-request test
job. PostCSS imports `nanoid/non-secure` and calls `nanoid(6)`; the reported
`customAlphabet` and `customRandom` zero-size path is not reached.
This low application reachability limits the immediate tryscript impact, but each
authoritative advisory is High severity and can terminate or stall a process in an
affected consumer. The user approved exact exceptions for serious advisories after
artifact review.

The review established:

- **`brace-expansion@5.0.9`.** The registry `gitHead` matches tag `v5.0.9`; the reviewed
  source bounds both intermediate expansion paths.
  The same publisher and maintainers shipped 5.0.8 and 5.0.9. The 13-file tarball
  matches its registry SHA-512, contains no install lifecycle script or unsafe path, and
  adds no dependency. The signed fix merge, 17-platform upstream matrix, and Socket check
  pass. The release commit and tag have no publisher provenance, so the two minimatch
  edges used by ESLint and c8 are overridden exactly rather than exempting every
  brace-expansion consumer.
- **`js-yaml@3.15.1` and `js-yaml@4.3.1`.** Registry `gitHead` values match both release
  tags. Each source and 36-file artifact contains the same minimal ordered-map backport:
  replace the quadratic array scan with own-property lookup.
  The sole npm publisher, maintainers, dependencies, and package file sets are
  unchanged; neither artifact has an install lifecycle script or unsafe path.
  The v4 CI run passes.
  The v3 branch has no release check run, so its source, rebuilt distribution, and
  artifact delta were reviewed directly.
  Neither legacy release has a signed tag or provenance; both pins are therefore exact
  and independently integrity-locked.
- **`nanoid@3.3.17`.** The fix adds only the nonpositive-size return to the synchronous,
  browser, and asynchronous custom generators.
  The commit and tag have verified SSH signatures.
  npm trusted-publisher provenance binds the exact tarball SHA-512 to tag `3.3.17`,
  commit `73d67168136b36fd3b644159b0cff149da4905d9`, and successful GitHub Actions
  release run `30805488095`. The 25-file artifact has no dependency, install lifecycle
  script, unsafe path, or unexpected file; its clean-publish differences only remove
  comments, development metadata, and test scripts.

The four exact versions are scoped in `overrides` and `minimumReleaseAgeExclude`. No
range or package family is exempt.
**Reviewed-by: jlevy.** Root and package-workspace dependency graphs resolve only
`brace-expansion@5.0.9`, `js-yaml@3.15.1` and `4.3.1`, and `nanoid@3.3.17`. Their
lockfile SHA-512 values match the reviewed registry artifacts.
Both `pnpm audit --prod --audit-level=moderate` and the full
`pnpm audit --audit-level=moderate` report no known vulnerabilities.
Follow-up bead `try-t2h5` is deferred until 2026-08-18, when every exception has crossed
the 14-day window; it rechecks registry availability, lockfile integrity, and both
audits before the exception record is considered fully aged.

**Two verification notes**, both cases where the obvious approach silently did nothing:

- **`minimumReleaseAge` in `.npmrc` does not work.** pnpm 10.34.5 reads the value back
  via `pnpm config get minimumReleaseAge` (returning 20160) but does not apply it during
  resolution — installing a 6-day-old version succeeded.
  pnpm 11 ignores the key entirely.
  Only `pnpm-workspace.yaml` gates on both majors, verified by a install that is refused
  with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. The policy therefore lives in
  `pnpm-workspace.yaml`, and `.npmrc` carries a comment recording why it is not there.
- **A `picomatch@<2.3.2` override selector reported success while changing nothing.**
  `pnpm audit` stopped reporting the advisory, but `picomatch@2.3.1` was still the
  installed version: the selector matches a requested *range*, and `micromatch` requests
  `^2.3.1`, which is not literally `<2.3.2`. Advisory fixes are therefore verified here
  by resolving the module and reading its version, not by reading audit output.

**Install-time hardening.** The repo carried no release-age gate; `minimumReleaseAge` is
now set in `pnpm-workspace.yaml` so the cool-off is enforced by the package manager
rather than by reviewer discipline.
That needs pnpm 10.16+, so `packageManager` moves 10.11.0 → 10.34.5 (published
2026-07-10, eligible).
CI already runs `--frozen-lockfile`, so the committed lockfile remains the authority on
exact versions. Build scripts stay at pnpm’s blocking default (`esbuild` and `lefthook`
are reported as ignored and are not allowlisted) — the build and full test suite pass
without them, so there is nothing to gain by granting them.

The Markdown floor uses `flowmark-rs==0.3.2`, published 2026-07-15 with no Python
dependencies. Local commands invoke that exact release through `uvx`; CI pins uv 0.11.28
and the signed `astral-sh/setup-uv` v9.0.0 commit, both outside the cool-off window.
`.flowmarkignore` excludes managed agent instructions, synchronized snapshots, completed
specs, generated release records, and byte-exact golden fixtures.
Prettier continues to exclude Markdown, so one formatter owns each file type.

**Two upgrade regressions, both caught and fixed.**

- **Duplicate shebang.** tsdown began preserving the `#!/usr/bin/env node` already in
  `src/bin.ts`, while the config also injected one via `banner`. Two `#!` lines is a
  syntax error — the built CLI failed to start at all, taking out 6 CLI integration
  tests and the entire golden suite.
  The redundant `banner` is removed.
  Note that `pnpm build` reported this only as a `[DUPLICATE_SHEBANG]` warning and still
  exited 0; the test suite is what turned it into a failure.
- **tsdown 0.22 drops Node 20.** Its engines moved to `^22.18.0 || >=24.11.0`, and it
  calls `Promise.withResolvers`, which does not exist on Node 20. tryscript declares
  `engines: {"node": ">=20"}` and builds with `target: node20`, so taking 0.22 would
  have meant the package could no longer be built on the oldest runtime it claims to
  support. Pinned to **0.21.10** instead — the newest release still on `>=20.19.0`,
  published 2026-04-22 and cool-off eligible.
  Verified by running the full CI sequence under Node 20.20.2 and every published
  package entry point under Node 20.0.0.

This one only surfaced on the older CI runtime: newer Node releases let the broken build
succeed. Auditing declared `engines` across the installed tree is not sufficient on its
own either — `ast-kit@3.0.0` and `@babel/*@8` also declare `^22.18.0 || >=24.11.0` yet
build fine on Node 20, so an `engine-strict` gate would fail the build for packages that
actually work. Running the built artifact on the declared minimum Node is the check that
distinguishes them.

**Version boundaries.** Runtime majors remain deferred (see above).
The remediation adopts the current production TypeScript 6 and ESLint 10 guideline floor
and aligns development types with the Node 20 runtime contract.
TypeScript 7 remains non-production; pnpm 11, npm-check-updates 23, `@types/node` 26,
and tsdown 0.22 are intentionally deferred because they are major changes or drop the
supported development runtime.

## Release Plan

1. Fix B1-B12 with a regression test per fix.
2. Dependency and hardening changes above; `pnpm audit` clean of runtime findings.
3. `pnpm precommit` plus golden self-tests green.
4. Changeset as a **minor** release because the public validation API and CLI
   capabilities are additive, while the compatibility review found no required
   major-version break.
5. Release notes and migration guidance call out B2 and B4 explicitly: both can turn a
   currently-green suite red, and in both cases the green was wrong.
6. Pack through npm-compatible behavior, require the MIT license, compile both
   declaration formats, and replay the pinned v0.1.7 corpus.
7. Obtain the required fresh-security-fix sign-off and require clean production and full
   audits.
8. Address every PR review finding, run all gates on Node 20.0.0 and the normal CI
   runtime, and require green CI before marking the PR ready.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
