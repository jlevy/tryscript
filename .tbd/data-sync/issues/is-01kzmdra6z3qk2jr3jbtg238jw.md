---
type: is
id: is-01kzmdra6z3qk2jr3jbtg238jw
title: Normalize invalid top-level project configuration
kind: bug
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:30.334Z
updated_at: 2026-08-10T00:34:09.221Z
closed_at: 2026-08-10T00:34:09.221Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
A project config that default-exports null, an array, or a primitive receives a non-fatal validation warning but is still consumed as TryscriptConfig; property reads then crash. Preserve the warning, normalize unusable top-level values to an empty config, and run requested files safely.
