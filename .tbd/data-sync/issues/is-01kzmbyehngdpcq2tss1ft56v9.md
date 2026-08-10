---
type: is
id: is-01kzmbyehngdpcq2tss1ft56v9
title: Surface coverage filesystem and reporter failures
kind: bug
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:54.228Z
updated_at: 2026-08-10T00:34:09.435Z
closed_at: 2026-08-10T00:34:09.435Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Coverage statistics and text-report failures are swallowed, producing misleading zero-coverage results or silent degradation. Preserve actionable errors and consolidate external LCOV merging.
