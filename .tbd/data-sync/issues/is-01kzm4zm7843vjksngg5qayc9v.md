---
type: is
id: is-01kzm4zm7843vjksngg5qayc9v
title: Use platform-correct shell exit codes for terminating signals
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
created_at: 2026-08-09T20:56:12.775Z
updated_at: 2026-08-10T00:34:09.018Z
closed_at: 2026-08-10T00:34:09.017Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R1. packages/tryscript/src/lib/runner.ts hard-codes Linux signal numbers, so macOS and other platforms report the wrong shell-style exit code. Use the runtime signal table and add platform-aware regression coverage.
