---
type: is
id: is-01kzmbydtcxecged68cnwakeqa
title: Keep wildcard captures aligned with custom regex groups
kind: bug
status: closed
priority: 1
version: 4
spec_path: docs/project/specs/active/spec-v0.1.8-stability-review.md
labels: []
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T22:57:53.483Z
updated_at: 2026-08-10T00:51:02.784Z
closed_at: 2026-08-10T00:34:09.164Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Capturing groups inside custom wildcard regexes shift positional captures, causing later wildcard expansions to receive the wrong value. Use stable outer capture identities.
