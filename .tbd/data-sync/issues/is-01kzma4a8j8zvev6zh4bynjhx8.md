---
type: is
id: is-01kzma4a8j8zvev6zh4bynjhx8
title: Make discovered test-file execution order deterministic
kind: bug
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:26:09.297Z
updated_at: 2026-08-10T00:34:09.393Z
closed_at: 2026-08-10T00:34:09.393Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
fast-glob documents that matches are returned in arbitrary order, but run executes them directly. Report ordering and --fail-fast selection can vary by filesystem and concurrency. Sort absolute paths with a deterministic ordinal comparator before execution and cover it.
