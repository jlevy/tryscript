---
type: is
id: is-01kzmcpzw1fm5wa38d15wghp2v
title: "Cleanup: optional types"
kind: task
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzmcpejjza5fnq7vybyvrxet
created_at: 2026-08-09T23:11:18.400Z
updated_at: 2026-08-10T00:34:09.494Z
closed_at: 2026-08-10T00:34:09.494Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review optional fields and parameters, especially booleans, and remove ambiguity where
compatibility permits.
Then run the full precommit cycle and fix every build or test failure.

## Notes

Reviewed optionals: config and CLI flags model absence; TestBlock offsets remain
optional for v0.1.7 compatibility.
Removed stale optional defaults where unnecessary.
