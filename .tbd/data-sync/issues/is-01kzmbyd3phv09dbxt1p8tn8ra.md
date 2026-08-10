---
type: is
id: is-01kzmbyd3phv09dbxt1p8tn8ra
title: Reject cyclic default exports in config modules
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:52.757Z
updated_at: 2026-08-10T00:51:02.765Z
closed_at: 2026-08-10T00:34:09.145Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
unwrapDefaultExport can loop forever when two module wrapper objects reference each other through default exports. Detect cycles and report the config path with an actionable error.
