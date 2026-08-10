---
type: is
id: is-01kzma6xz8yvkde60zan7wx682
title: Surface coverage temporary-directory cleanup failures
kind: bug
status: closed
priority: 2
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:27:35.015Z
updated_at: 2026-08-10T00:51:02.700Z
closed_at: 2026-08-10T00:34:09.402Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
cleanupCoverageContext catches access and removal errors indiscriminately, so permission or I/O failures can leak coverage data while the CLI succeeds. Use forceful recursive removal for the absent-directory case and propagate real cleanup errors.
