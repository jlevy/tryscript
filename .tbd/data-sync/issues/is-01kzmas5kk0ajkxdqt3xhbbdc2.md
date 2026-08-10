---
type: is
id: is-01kzmas5kk0ajkxdqt3xhbbdc2
title: Remove repository write permission from pull-request test execution
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:37:32.658Z
updated_at: 2026-08-10T00:51:02.741Z
closed_at: 2026-08-10T00:34:09.124Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
CI grants contents:write to the test job because main-branch badge commits share that job. Pull-request code and dependencies therefore execute with unnecessary repository write authority. Make contents read-only for tests and move badge generation/commit to a main-only job with scoped write permission.

## Notes

Split PR tests from the coverage-comment job so repository code never executes with pull-request write permission.
