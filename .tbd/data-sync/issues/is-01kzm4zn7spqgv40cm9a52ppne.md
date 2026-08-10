---
type: is
id: is-01kzm4zn7spqgv40cm9a52ppne
title: Expand stderr-only and mixed-output wildcards
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
created_at: 2026-08-09T20:56:13.816Z
updated_at: 2026-08-10T01:12:35.438Z
closed_at: 2026-08-10T00:34:09.295Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R4. expandTestFile skips expansion when stdout is empty and uses only stdout's expansion count. Expand stderr-only and mixed stdout/stderr wildcards and add regression tests.
