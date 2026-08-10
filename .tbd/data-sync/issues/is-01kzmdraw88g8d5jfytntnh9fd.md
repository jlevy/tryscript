---
type: is
id: is-01kzmdraw88g8d5jfytntnh9fd
title: Reject process closes without an exit status
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:31.015Z
updated_at: 2026-08-10T00:51:03.011Z
closed_at: 2026-08-10T00:34:09.234Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
exitCodeFor still maps code=null and signal=null to success after the signal fix. An indeterminate process close must be an execution error, never a false exit 0.
