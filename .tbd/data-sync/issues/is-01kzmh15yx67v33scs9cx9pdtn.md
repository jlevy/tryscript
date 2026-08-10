---
type: is
id: is-01kzmh15yx67v33scs9cx9pdtn
title: Make serialized LCOV ordering fully deterministic
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
created_at: 2026-08-10T00:26:46.621Z
updated_at: 2026-08-10T00:34:09.567Z
closed_at: 2026-08-10T00:34:09.567Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The current tbd TypeScript sorting guideline requires stable secondary keys. formatLcov currently relies on Map/array insertion order for files and branches and sorts functions only by line number. Sort files, functions, branches, and lines with complete deterministic comparison chains and add an order-independent regression.
