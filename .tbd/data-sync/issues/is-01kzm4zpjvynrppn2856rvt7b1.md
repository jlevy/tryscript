---
type: is
id: is-01kzm4zpjvynrppn2856rvt7b1
title: Harden gh bootstrap temporary files and installation
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
created_at: 2026-08-09T20:56:15.195Z
updated_at: 2026-08-10T00:51:02.532Z
closed_at: 2026-08-10T00:34:09.309Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Review suggestion S1. The gh bootstrap scripts use predictable /tmp/gh_* paths and a non-atomic install. Use a private temporary directory, cleanup trap, and atomic final rename; verify both copies.
