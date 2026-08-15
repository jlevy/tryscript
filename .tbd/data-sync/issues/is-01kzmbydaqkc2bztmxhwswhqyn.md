---
type: is
id: is-01kzmbydaqkc2bztmxhwswhqyn
title: Wait for timeout process-tree termination
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:52.982Z
updated_at: 2026-08-10T01:12:41.331Z
closed_at: 2026-08-10T00:34:09.152Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Command timeouts reject before asynchronous process-tree termination completes, allowing descendants to outlive a failed test and mutate state. Settle only after tree-kill completes and surface kill failures.
