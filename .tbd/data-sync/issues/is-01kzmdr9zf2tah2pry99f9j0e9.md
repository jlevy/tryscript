---
type: is
id: is-01kzmdr9zf2tah2pry99f9j0e9
title: Honor configured LCOV merging in every coverage command
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:30.094Z
updated_at: 2026-08-10T00:51:02.976Z
closed_at: 2026-08-10T00:34:09.211Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
run --coverage adds the required lcov reporter only when --merge-lcov is passed directly, not when mergeLcov comes from tryscript.config. The coverage subcommand also lets merge failures escape as an internal exit. Resolve the effective merge path first, require lcov, report merge failures consistently, and retain cleanup.
