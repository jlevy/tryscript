---
type: is
id: is-01kzmcpzdv3rcm7099b1xxmb5c
title: "Cleanup: dead code"
kind: task
status: closed
priority: 2
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzmcpejjza5fnq7vybyvrxet
created_at: 2026-08-09T23:11:17.946Z
updated_at: 2026-08-10T01:12:53.221Z
closed_at: 2026-08-10T00:34:09.480Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Find and remove dead code; retain unusually useful code only with a justified TODO. Then run the full precommit cycle and fix every build or test failure.

## Notes

Removed the unused shared duration formatter and the unused runBeforeHook export.
