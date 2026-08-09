# Stability Review for tryscript v0.1.8

**Status:** active
**Baseline:** v0.1.7 (`0a79ba8`)
**Date:** 2026-08-09

A full review of tryscript's correctness, ergonomics, and dependency posture, to decide
whether a patch release is warranted and what it should contain.

**Conclusion: yes, ship v0.1.8.** The review found 12 defects, 5 of which cause tryscript
to report a *wrong* result — the worst class of bug for a testing tool, because the
failure is silent. Every fix below preserves the behavior of test files that pass on
v0.1.7.

## Backward Compatibility Contract

Every change here obeys one rule: **a `.tryscript.md` file that passes on v0.1.7 must
still pass on v0.1.8.** Fixes therefore fall into three safe shapes:

- Tests that wrongly *failed* now pass (B3).
- Tests that wrongly *passed* now fail (B2) — a false pass is not behavior worth
  preserving, and this is called out in the release notes.
- Files that were silently misinterpreted now produce a parse error at author time,
  never a changed result (B4).

The one deliberate hard error is B4 (multiple prompts per block). It cannot be a warning:
the current behavior builds a command nobody wrote, so anything short of rejecting it
leaves the hazard in place. Issue #46 requests exactly this.

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
| B7 | S2 | `--update`/`--expand` rewrite ` ```bash ` fences as ` ```console ` | `updater.ts:70`, `expander.ts:181` | new |
| B8 | S3 | Duplicate blocks all report the first block's line number | `parser.ts:107` | new |
| B9 | S3 | Non-numeric `? ` yields `NaN` with no parse error | `parser.ts:171` | new |
| B10 | S3 | Failure diff shows combined output when stderr is asserted separately | `run.ts:294` | new |
| B11 | S3 | Custom pattern containing `$&`, `` $` ``, or `$'` is corrupted | `matcher.ts:88,238` | new |
| B12 | S4 | Frontmatter is never validated; typo'd keys are silently ignored | `parser.ts:94` | new |

### B1 — Wrong block updated (#47)

`updater.ts` and `expander.ts` both locate the block to rewrite with
`content.indexOf(block.rawContent)`. When two blocks have byte-identical source,
`indexOf` returns the *first* one regardless of which block the result belongs to.
Processing in reverse then rotates outputs among the duplicates.

Reproduced: a file that writes `first`, reads it, writes `second`, reads it. After
`--update` the first read block claims `second` and the second claims `first` — exactly
inverted, and the file then passes, cementing the wrong golden.

**Fix:** record each block's source `startOffset`/`endOffset` in the parser and splice by
offset. This removes the ambiguity rather than narrowing it, as #47 recommends.

### B2 — Signal-killed command falsely passes

`proc.on('close', (code) => ... exitCode: code ?? 0)`. When the spawned shell is
terminated by a signal, `code` is `null` and `signal` holds the name, so tryscript
records **0**. A command killed by SIGKILL is reported as a clean success.

Reproduced: `$ kill -KILL $$` against `? 99` reports "got 0". A real shell reports 137.

**Fix:** follow the shell convention and report `128 + signal` when `code === null`.

### B3 — Output without a trailing newline can never match

`normalizeOutput` collapses trailing newlines with `.replace(/\n+$/, '\n')`, which
normalizes *one or more* to one but leaves *zero* alone. The parser, meanwhile, always
terminates `expectedOutput` with `\n`. So any CLI that writes its last line without a
trailing newline is untestable.

This is the worst of the set for users because `--update` does not rescue them: it writes
back the identical text and the block still fails, with a diff that renders as identical
lines. Reproduced with `process.stdout.write('no-trailing-newline')`.

**Fix:** `.replace(/\n*$/, '\n')` on non-empty output. Strictly widens what matches, so no
passing test changes.

### B4 — Multiple prompts concatenate (#46)

`parseBlockContent` pushes every `$ ` line into `commandLines` and joins them with a
space. Two intended invocations become one, with the second as arguments to the first.
Reproduced: two `node -e` prompts produced only `A`; the second never ran.

**Fix:** reject a second `$ ` prompt with a parse error naming the file and line, and
pointing the author at a separate fence.

### B5 — Blank stderr lines inexpressible (#45)

The parser tests `line.startsWith('! ')`, so a bare `!` falls through to stdout. Writing
`! ` with a trailing space works only until an editor, formatter, or `git diff --check`
strips it.

**Fix:** treat a line equal to `!` as an empty stderr line.

### B6/B7 — Lossy rewrites

`buildUpdatedBlock` reconstructs a block from `command` + `actualOutput` + exit code
only. Two things are dropped:

- **B6:** `!`-prefixed stderr assertions. A block that asserted stdout and stderr
  separately is rewritten as a single combined-output block. It passes afterward, so the
  weakening is invisible — the test no longer checks what it was written to check.
- **B7:** the fence info string. ` ```bash ` becomes ` ```console `.

**Fix:** preserve the info string, and re-emit `!` lines from `actualStderr` whenever the
block asserted stderr separately.

### B8-B11 — Misleading diagnostics

- **B8:** `lineNumber` uses `content.indexOf(codeBlock.fullMatch)` — the same duplicate
  hazard as B1. Two identical blocks both report "Line 1". Fixed for free by the B1
  offset work.
- **B9:** `parseInt('three')` yields `NaN`, and the block reports "Expected exit code
  NaN". Should be a parse error.
- **B10:** when `expectedStderr` is set the comparison uses stdout only, but the diff is
  built from `result.actualOutput` (combined), so stderr lines appear as phantom
  additions.
- **B11:** markers are substituted with `regex.replaceAll(marker, replacement)`. A
  replacement string containing `$&`, `` $` ``, `$'`, or `$<` is interpreted by
  `replaceAll`'s substitution rules instead of inserted literally. Verified: a custom
  pattern of `\$&` fails to match the text it describes, while the same pattern without
  `$` matches. Fixed by passing a function replacement.

### B12 — Frontmatter is never validated

`TestConfigSchema`, `FixtureSchema`, and `CoverageConfigSchema` are defined in
`types.ts` and used **only** for `z.infer`. No `.parse()` or `.safeParse()` call exists
anywhere in the source. `parseTestFile` does `parseYaml(yamlContent) as TestConfig` — an
unchecked cast. A typo like `sandbox: ture` or `timout: 5000` is silently ignored and the
test runs with surprising defaults.

**Fix:** validate frontmatter with `safeParse` and emit warnings for unknown keys and
type mismatches. **Warnings, not errors** — an existing file with a stray key must keep
running.

Note the consequence for the dependency graph: because the schemas are only used for
types, `zod` is tree-shaken out of the bundle entirely (`grep -c zod dist/bin.mjs` → 0)
while remaining a declared runtime dependency every consumer installs. Wiring up
validation makes that dependency honest.

## Deferred

- **#44 (startup timing diagnostics)** — a feature, not a fix. Out of scope for a patch
  release; the per-command duration is already collected in `TestBlockResult.duration`,
  so a `--timings` summary is a small follow-up.
- **Runtime major bumps** — `zod` 3→4 (the `z.record` signature changed and would break
  `TestConfigSchema`), `commander` 14→15, `diff` 8→9. Each needs its own compatibility
  pass; none carries a security advisory at the version in use after this release.

## Dependency and Supply-Chain Review

Reviewed against [supply-chain-hardening](https://github.com/jlevy/supply-chain-hardening)
(`SUPPLY-CHAIN-SECURITY.md` install rules, `guidelines/hardening-npm.md`).

**Cool-off:** 14 days. Cutoff for this release is **2026-07-26**. Every version selected
below was published on or before that date; where the newest release is inside the
window, the newest *eligible* version was pinned instead. No exceptions were taken, so no
`Reviewed-by:` sign-off is required.

Held back by cool-off (newest release too young, pinned lower):

| Package | Newest | Published | Pinned | Published |
| --- | --- | --- | --- | --- |
| `typescript-eslint` | 8.66.0 | 2026-08-03 | 8.65.0 | 2026-07-20 |
| `publint` | 0.3.23 | 2026-08-04 | 0.3.22 | 2026-07-23 |
| `tsx` | 4.23.11 | 2026-08-07 | 4.23.1 | 2026-07-13 |

**Advisories.** `pnpm audit` reported 43 findings. Two touch the published runtime
dependency tree; the rest are dev-only (eslint, vitest/vite, changesets, tsdown).

- `diff` — GHSA-73rr-hh4g-fpgx, DoS in `parsePatch`/`applyPatch`. Patched in 8.0.3.
  Resolved version was 8.0.2, and tryscript calls `createPatch` on every failure diff.
  Bumped to `^8.0.4`.
- `yaml` — advisory against the resolved 2.8.2. Bumped to `^2.9.0`.

- `picomatch` — GHSA-c2c7-rcm5-vvqj (ReDoS via extglob) and GHSA-3v7f-55p6-f55p
  (method injection in POSIX character classes), both patched in 2.3.2. Reached through
  `fast-glob` → `micromatch` → `picomatch`. `micromatch` already allows `^2.3.1`, but
  resolution stuck at 2.3.1 and `pnpm update --depth Infinity` did not move it, so a
  `micromatch>picomatch` override pins `^2.3.2`. The override is scoped to that path so
  the unrelated `picomatch` 4.x used by the build tooling is untouched.

After these changes `pnpm audit --prod` reports no known vulnerabilities. The full
audit (dev included) drops from 43 findings to 30, all in dev-only tooling.

**Two verification notes**, both cases where the obvious approach silently did nothing:

- **`minimumReleaseAge` in `.npmrc` does not work.** pnpm 10.34.5 reads the value back
  via `pnpm config get minimumReleaseAge` (returning 20160) but does not apply it during
  resolution — installing a 6-day-old version succeeded. pnpm 11 ignores the key
  entirely. Only `pnpm-workspace.yaml` gates on both majors, verified by a install that
  is refused with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. The policy therefore lives in
  `pnpm-workspace.yaml`, and `.npmrc` carries a comment recording why it is not there.
- **A `picomatch@<2.3.2` override selector reported success while changing nothing.**
  `pnpm audit` stopped reporting the advisory, but `picomatch@2.3.1` was still the
  installed version: the selector matches a requested *range*, and `micromatch` requests
  `^2.3.1`, which is not literally `<2.3.2`. Advisory fixes are therefore verified here
  by resolving the module and reading its version, not by reading audit output.

**Install-time hardening.** The repo carried no release-age gate; `minimumReleaseAge` is
now set in `pnpm-workspace.yaml` so the cool-off is enforced by the package manager
rather than by reviewer discipline. That needs pnpm 10.16+, so `packageManager` moves
10.11.0 → 10.34.5 (published 2026-07-10, eligible). CI already runs `--frozen-lockfile`,
so the committed lockfile remains the authority on exact versions. Build scripts stay at
pnpm's blocking default (`esbuild` and `lefthook` are reported as ignored and are not
allowlisted) — the build and full test suite pass without them, so there is nothing to
gain by granting them.

**Two upgrade regressions, both caught and fixed.**

- **Duplicate shebang.** tsdown began preserving the `#!/usr/bin/env node` already in
  `src/bin.ts`, while the config also injected one via `banner`. Two `#!` lines is a
  syntax error — the built CLI failed to start at all, taking out 6 CLI integration
  tests and the entire golden suite. The redundant `banner` is removed. Note that
  `pnpm build` reported this only as a `[DUPLICATE_SHEBANG]` warning and still exited 0;
  the test suite is what turned it into a failure.
- **tsdown 0.22 drops Node 20.** Its engines moved to `^22.18.0 || >=24.11.0`, and it
  calls `Promise.withResolvers`, which does not exist on Node 20. tryscript declares
  `engines: {"node": ">=20"}` and builds with `target: node20`, so taking 0.22 would have
  meant the package could no longer be built on the oldest runtime it claims to support.
  Pinned to **0.21.10** instead — the newest release still on `>=20.19.0`, published
  2026-04-22 and cool-off eligible. Verified by running the full CI sequence
  (`format:check`, `lint:check`, `build`, `publint`, `test:coverage`) under an actual
  Node 20.20.2, the version CI uses.

This one only surfaced in CI: the local toolchain runs Node 22, where the broken build
succeeds. Auditing declared `engines` across the installed tree is not sufficient on its
own either — `ast-kit@3.0.0` and `@babel/*@8` also declare `^22.18.0 || >=24.11.0` yet
build fine on Node 20, so an `engine-strict` gate would fail the build for packages that
actually work. Running the real build on the oldest supported Node is the check that
distinguishes them.

**Not changed.** Runtime majors are deferred (see above). Dev-dependency majors
(`eslint` 9→10, `typescript` 5→7, `@types/node` 22→26) are out of scope for a patch
release and each needs its own pass.

## Release Plan

1. Fix B1-B12 with a regression test per fix.
2. Dependency and hardening changes above; `pnpm audit` clean of runtime findings.
3. `pnpm precommit` plus golden self-tests green.
4. Changeset as a **patch** — all changes are fixes, and no documented API changes shape.
5. Release notes call out B2 and B4 explicitly: both can turn a currently-green suite
   red, and in both cases the green was wrong.
