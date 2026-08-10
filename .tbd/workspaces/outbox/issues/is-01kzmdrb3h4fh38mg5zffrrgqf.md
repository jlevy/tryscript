---
type: is
id: is-01kzmdrb3h4fh38mg5zffrrgqf
title: Make custom regex patterns capture-safe and explicit
kind: bug
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:31.248Z
updated_at: 2026-08-10T00:34:09.241Z
closed_at: 2026-08-10T00:34:09.241Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
RegExp flags are silently discarded, numeric backreferences change meaning inside
wildcard capture wrappers, and reserved custom names can collide with built-in tokens
and crash expansion.
Preserve supported regex semantics or reject unsupported inputs explicitly, validate
reserved names, and add match/capture/expand regressions.
