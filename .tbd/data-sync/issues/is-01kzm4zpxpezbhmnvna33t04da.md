---
type: is
id: is-01kzm4zpxpezbhmnvna33t04da
title: Keep block-writer helpers out of the public root API
kind: task
status: closed
priority: 3
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T20:56:15.541Z
updated_at: 2026-08-10T00:34:09.586Z
closed_at: 2026-08-10T00:34:09.586Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review suggestion S2. buildBlock, spliceBlocks, fenceOf, and BlockParts are implementation details newly exported from the package root. Keep them internal while retaining the intended public TestBlock compatibility.
