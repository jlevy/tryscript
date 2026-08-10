---
type: is
id: is-01kzmh15r3fzsqsnrrqw4maeg9
title: Handle closed CLI output pipes without crashing
kind: bug
status: closed
priority: 2
version: 6
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-10T00:26:46.402Z
updated_at: 2026-08-10T01:12:52.658Z
closed_at: 2026-08-10T00:34:09.558Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The current tbd TypeScript CLI guideline requires EPIPE handling on stdout and stderr so commands remain composable when a pager or downstream process closes early. Register handlers at the binary entry point, preserve non-EPIPE failures, and add regression coverage.
