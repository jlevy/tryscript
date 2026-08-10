---
type: is
id: is-01kzm5gmh9075es1bdk047qpj7
title: Bring git hooks and CI checks to the current tbd quality floor
kind: task
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
  - discovered
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:05:30.152Z
updated_at: 2026-08-10T00:34:09.045Z
closed_at: 2026-08-10T00:34:09.045Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Discovered while comparing PR #48 to current lint and supply-chain guidelines. Hooks use download-capable npx, run stage_fixed jobs in parallel, and pre-push runs tests only. Use pinned local binaries and a serial pre-commit plus full verify-only pre-push/CI gates, including package runtime smoke and audit.
