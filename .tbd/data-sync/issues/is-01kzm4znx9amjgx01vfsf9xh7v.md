---
type: is
id: is-01kzm4znx9amjgx01vfsf9xh7v
title: Remove stale bin config warnings from docs and golden suites
kind: bug
status: closed
priority: 3
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T20:56:14.504Z
updated_at: 2026-08-10T00:34:09.575Z
closed_at: 2026-08-10T00:34:09.575Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R6. docs/development.md and two official .tryscript.md suites still use the removed bin key, so the project's own examples emit warnings. Update them and guard official golden files against config warnings.
