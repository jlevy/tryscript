---
type: is
id: is-01kzm9vzpmtne531tb8cvgnjry
title: Preserve Windows absolute entries in configured PATH
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
created_at: 2026-08-09T22:21:36.339Z
updated_at: 2026-08-10T00:51:02.681Z
closed_at: 2026-08-10T00:34:09.383Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Senior review found createExecutionContext recognizes absolute config.path entries only by a leading slash. On Windows, drive-letter and UNC paths are incorrectly resolved relative to the test file. Use node:path isAbsolute and add a platform-independent regression.
