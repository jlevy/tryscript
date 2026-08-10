---
type: is
id: is-01kzm9ywxpjd27awptxedr46p2
title: Fail when requested external LCOV merge cannot complete
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:23:11.797Z
updated_at: 2026-08-10T01:12:47.289Z
closed_at: 2026-08-10T00:34:09.100Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The run command treats mergeExternalCoverage() returning null as success, so a missing external or generated LCOV file logs an error but exits 0. Throw through the artifact-failure path, return non-zero, retain coverage cleanup, and add integration coverage.
