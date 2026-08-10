---
type: is
id: is-01kzm4zmj7kmnskbbzr0xbxd03
title: Pin executable tbd fallbacks to a cool-off-eligible version
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
created_at: 2026-08-09T20:56:13.126Z
updated_at: 2026-08-10T00:34:09.028Z
closed_at: 2026-08-10T00:34:09.028Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R2. Four agent session scripts execute get-tbd@0.4.2 even though it is inside the project's 14-day supply-chain cool-off. Pin the newest eligible reviewed release and verify every executable fallback.
