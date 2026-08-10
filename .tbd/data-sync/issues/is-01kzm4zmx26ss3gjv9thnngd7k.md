---
type: is
id: is-01kzm4zmx26ss3gjv9thnngd7k
title: Validate coverage and nested fixture config with precise paths
kind: bug
status: closed
priority: 2
version: 7
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T20:56:13.473Z
updated_at: 2026-08-10T01:12:50.907Z
closed_at: 2026-08-10T00:34:09.288Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R3. Frontmatter validation allowlists coverage without validating its shape, FixtureSchema accepts typoed nested keys, and CLI warnings discard ConfigWarning.path. Make validation complete while preserving raw forward-compatible config.
