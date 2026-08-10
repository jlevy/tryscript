---
type: is
id: is-01kzm4znjgknmde2jzbrm96y9f
title: Preserve TestBlock source compatibility
kind: bug
status: closed
priority: 2
version: 5
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T20:56:14.159Z
updated_at: 2026-08-10T00:51:02.512Z
closed_at: 2026-08-10T00:34:09.303Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review R5. The patch added required startOffset, endOffset, and infoString fields to exported TestBlock, breaking existing TypeScript consumers in a patch release. Restore compatibility and cover legacy-shaped blocks.
