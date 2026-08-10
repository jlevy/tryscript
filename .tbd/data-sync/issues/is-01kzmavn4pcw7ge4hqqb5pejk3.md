---
type: is
id: is-01kzmavn4pcw7ge4hqqb5pejk3
title: Isolate npm OIDC publishing from release build and tests
kind: bug
status: closed
priority: 1
version: 5
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:38:54.102Z
updated_at: 2026-08-10T00:51:02.748Z
closed_at: 2026-08-10T00:34:09.130Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
The release job grants id-token:write while installing, building, and testing dependencies, so compromised build-time code can request the npm publishing identity. Split read-only verification/packing from an OIDC publish job and transfer only the verified tarball via aged, SHA-pinned official artifact actions.

## Notes

Split npm OIDC publishing from GitHub release creation and validate tag-to-package version before publish.
