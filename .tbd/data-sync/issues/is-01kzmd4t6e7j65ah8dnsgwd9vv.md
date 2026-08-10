---
type: is
id: is-01kzmd4t6e7j65ah8dnsgwd9vv
title: Validate and immutably merge LCOV input
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
created_at: 2026-08-09T23:18:51.341Z
updated_at: 2026-08-10T00:34:09.203Z
closed_at: 2026-08-10T00:34:09.203Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
LCOV parsing accepts malformed numeric records as NaN, and merging mutates nested values from the first caller-owned report because the initial clone is shallow. Reject malformed records with source-line context, deep-clone merge inputs, and add immutability/error regressions.
