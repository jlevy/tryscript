---
type: is
id: is-01kzmdrbany0pxtjbmtv97ma0x
title: Keep path placeholder values literal during wildcard compilation
kind: bug
status: closed
priority: 1
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T23:29:31.476Z
updated_at: 2026-08-10T00:34:09.249Z
closed_at: 2026-08-10T00:34:09.249Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
ROOT and CWD values are substituted before wildcard token discovery. A directory containing text such as [..], [??], or a custom placeholder is reinterpreted as a wildcard, allowing incorrect paths to match. Protect path values as literal regex replacements and add regressions.
