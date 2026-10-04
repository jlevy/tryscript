---
type: is
id: is-01m44er29a92r1cvgx1djceyf8
title: Replace fast-glob with tinyglobby to drop braces (gh#56, GHSA-vfj7-8cjw-p6xm)
kind: bug
status: closed
priority: 0
version: 4
labels:
  - release
dependencies:
  - type: blocks
    target: is-01m44er4nc8tqwpzwj1g1ffrfs
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T21:57:29.002Z
updated_at: 2026-10-04T21:59:00.500Z
closed_at: 2026-10-04T21:59:00.500Z
close_reason: run.ts discovery moved to src/lib/discovery.ts on tinyglobby with expandDirectories:false; 12 parity cases pass identically on fast-glob 3.3.3 and tinyglobby 0.2.17.
---
Runtime. braces<=3.0.3 has no patched version (CVE-2026-93687, high). Only path: tryscript>fast-glob>micromatch>braces. Switch run.ts to tinyglobby@^0.2.17 (2026-05-30, trusted publishing+provenance, deps fdir ^6.5.0 + picomatch ^4.0.4, no lifecycle scripts). Set expandDirectories:false to keep fast-glob directory semantics. Add discovery tests: absolute pattern, cwd-relative, brace alternatives, dotfiles, bare directory, node_modules/dist ignore, deterministic order.
