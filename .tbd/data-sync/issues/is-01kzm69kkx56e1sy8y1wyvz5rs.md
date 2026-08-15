---
type: is
id: is-01kzm69kkx56e1sy8y1wyvz5rs
title: Reject unresolved legacy block rewrites instead of silently skipping
kind: bug
status: closed
priority: 2
version: 6
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:19:08.412Z
updated_at: 2026-08-10T01:12:34.964Z
closed_at: 2026-08-10T00:34:09.324Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The compatibility fallback for TestBlock values without source offsets currently drops an edit when rawContent cannot be found, while callers report the file updated. Make the failure explicit and tested so update/expand never claim an unapplied change.
