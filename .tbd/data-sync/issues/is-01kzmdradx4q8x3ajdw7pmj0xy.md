---
type: is
id: is-01kzmdradx4q8x3ajdw7pmj0xy
title: Capture separately asserted stderr in YAML logs
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
created_at: 2026-08-09T23:29:30.556Z
updated_at: 2026-08-10T00:51:02.996Z
closed_at: 2026-08-10T00:34:09.228Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Capture logs match expected stdout against combined actual output and never inspect expected stderr. Blocks using separate stream assertions therefore lose stdout and stderr wildcard captures. Record the two streams separately and label their captures without changing combined-output blocks.
