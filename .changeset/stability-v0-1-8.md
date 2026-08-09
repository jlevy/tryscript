---
'tryscript': patch
---

Fix twelve correctness and ergonomics defects, and clear the runtime dependency advisories.

Five of these caused tryscript to report a wrong result. Test files that pass on v0.1.7
still pass on v0.1.8; the project's own 124-block golden suite is unchanged.

**Wrong results**

- `--update` and `--expand` wrote captured output into the wrong block when two blocks
  had byte-identical source, rotating outputs among the duplicates and then passing on
  the next run, cementing the wrong golden (#47). Rewrites now splice by source offset.
- A command killed by a signal was recorded as exit code 0, so a crashing CLI passed its
  own test. Signals now report `128 + signal`, as a shell does.
- Output with no trailing newline could never match, and `--update` could not fix it —
  it rewrote the file to identical text that still failed. Any CLI whose last line came
  from a bare `process.stdout.write` was untestable.
- Two `$` prompts in one console block were silently joined into a single command, so
  the second ran as arguments to the first. This is now a parse error naming the line
  (#46).
- A bare `!` line was parsed as stdout, making a blank stderr line inexpressible except
  as `! ` with a trailing space that editors strip (#45).

**Lossy rewrites**

- `--update` and `--expand` discarded `!` stderr assertions, silently rewriting a block
  that checked stdout and stderr separately into one that checks them combined. The
  weakened test still passed, so the loss was invisible.
- `--update` and `--expand` rewrote ` ```bash ` fences as ` ```console `.

**Misleading output**

- Every duplicate block reported the first block's line number.
- A non-numeric `? ` value produced `Expected exit code NaN` instead of a parse error.
- The failure diff was built from combined output even when only stdout was compared,
  showing stderr lines as phantom additions. Stderr now gets its own labelled diff.
- A custom pattern containing `$&`, `` $` ``, `$'`, or `$<` was corrupted by
  `String.replaceAll` substitution rules and failed to match the text it described.

**Frontmatter validation**

Frontmatter was cast without validation, so a typo like `sandbx: true` was silently
ignored. Unknown and mistyped keys are now reported as warnings. They are warnings, not
errors, so existing files keep running.

**Exit codes and platform correctness**

A command terminated by a signal now reports `128 + signal`, with the signal number
read from `node:os` at runtime rather than a hard-coded table, so the code is correct
on every platform (`SIGUSR1` is 10 on Linux and 30 on macOS). A signal that cannot be
resolved reports 1, never a bare 128 that could be mistaken for a real `128 + 0`.

**Public API**

`TestBlock` keeps its v0.1.7 shape: the parser bookkeeping fields added for the
rewrite fix (`startOffset`, `endOffset`, `infoString`) are optional, so existing
TypeScript consumers that construct a `TestBlock` still compile. The rewrite path uses
a new `ParsedTestBlock` that requires them.

**Dependencies**

`diff` 8.0.2 → 8.0.4 (GHSA-73rr-hh4g-fpgx, DoS in `parsePatch`/`applyPatch`, hit on
every failure diff), `yaml` 2.8.2 → 2.9.0, and a scoped `micromatch>picomatch` override
for GHSA-c2c7-rcm5-vvqj and GHSA-3v7f-55p6-f55p. `pnpm audit --prod` is now clean.
