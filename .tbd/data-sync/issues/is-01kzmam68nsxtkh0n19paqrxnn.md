---
type: is
id: is-01kzmam68nsxtkh0n19paqrxnn
title: Normalize Commander-generated CLI error prefixes
kind: bug
status: closed
priority: 3
version: 3
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:34:49.492Z
updated_at: 2026-08-10T00:34:09.594Z
closed_at: 2026-08-10T00:34:09.594Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The remediation standardized runtime errors as 'Error:' but Commander argument/command failures still print lowercase 'error:', contradicting the documented CLI style. Configure root output once and update golden/integration assertions.
