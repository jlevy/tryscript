---
type: is
id: is-01kzmbye1ccwyk21jtv66rssv2
title: Execute build version Git commands without a shell
kind: bug
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:53.707Z
updated_at: 2026-08-10T00:34:09.170Z
closed_at: 2026-08-10T00:34:09.170Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The build version helper interpolates Git tags into shell commands and accepts malformed
version tags. Use argument-array execution and validate semantic version tags.
