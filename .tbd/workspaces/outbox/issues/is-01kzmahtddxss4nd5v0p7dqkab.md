---
type: is
id: is-01kzmahtddxss4nd5v0p7dqkab
title: Exclude unnamed blocks when --filter is active
kind: bug
status: closed
priority: 2
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:33:31.820Z
updated_at: 2026-08-10T00:34:09.410Z
closed_at: 2026-08-10T00:34:09.410Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
run filters named blocks by regex but explicitly keeps every unnamed block,
contradicting the help text and allowing unexpected commands/failures during a targeted
run. With --filter active, run only blocks with matching names and add an integration
regression.
