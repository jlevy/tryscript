---
type: is
id: is-01kzmcpzmyvempk4mva30enw2a
title: "Cleanup: any types"
kind: task
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzmcpejjza5fnq7vybyvrxet
created_at: 2026-08-09T23:11:18.173Z
updated_at: 2026-08-10T00:34:09.182Z
closed_at: 2026-08-10T00:34:09.182Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Find explicit or inferred unsafe any usage and replace it with source-derived or
inferred types. Then run the full precommit cycle and fix every build or test failure.

## Notes

Strict typed ESLint and tsc checkJs report no unsafe any usage across TS and maintained
MJS.
