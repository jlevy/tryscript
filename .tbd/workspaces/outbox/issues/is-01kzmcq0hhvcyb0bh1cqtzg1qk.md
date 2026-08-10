---
type: is
id: is-01kzmcq0hhvcyb0bh1cqtzg1qk
title: "Cleanup: constants and settings"
kind: task
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzmcpejjza5fnq7vybyvrxet
created_at: 2026-08-09T23:11:19.088Z
updated_at: 2026-08-10T00:34:09.517Z
closed_at: 2026-08-10T00:34:09.517Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review hard-coded values and consolidate genuinely shared constants without creating a
dumping-ground module.
Then run the full precommit cycle and fix every build or test failure.

## Notes

Reviewed constants. Coverage defaults remain centralized in config.ts; domain-local
parser, matcher, runner, and test timing constants stay local to avoid a dumping-ground
settings module.
