---
type: is
id: is-01kzm69kssfthpmtqjkd65pcyf
title: Make coverage output writes atomic
kind: task
status: closed
priority: 2
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:19:08.600Z
updated_at: 2026-08-10T00:34:09.330Z
closed_at: 2026-08-10T00:34:09.330Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The latest TypeScript guideline requires atomically for file writes, but LCOV and JSON
summary output still use node:fs writeFileSync.
Retain synchronous APIs while switching those writes to atomically and verify tests.
