---
type: is
id: is-01kzm69kdypd2ndv3tz6q955je
title: Preserve and enforce explicit empty-stderr assertions
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
created_at: 2026-08-09T21:19:08.221Z
updated_at: 2026-08-10T00:34:09.056Z
closed_at: 2026-08-10T00:34:09.056Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
A bare ! parses to expectedStderr='', but run.ts uses truthiness so non-empty actual stderr can falsely pass, and block-writer omits the marker on rewrite. Use definedness throughout, preserve the bare sentinel, and add execution/rewrite regressions.
