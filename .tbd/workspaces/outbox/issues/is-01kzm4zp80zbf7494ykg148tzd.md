---
type: is
id: is-01kzm4zp80zbf7494ykg148tzd
title: Make CommonJS package exports load on supported Node versions
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
created_at: 2026-08-09T20:56:14.848Z
updated_at: 2026-08-10T00:34:09.034Z
closed_at: 2026-08-10T00:34:09.034Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Pre-existing release blocker confirmed by the review.
require('tryscript') fails on Node 20 because the generated CJS output requires ESM-only
strip-ansi.
Fix the build and add runtime smoke coverage for ESM, CJS, and CLI artifacts.
