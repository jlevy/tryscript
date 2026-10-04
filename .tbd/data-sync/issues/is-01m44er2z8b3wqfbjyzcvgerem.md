---
type: is
id: is-01m44er2z8b3wqfbjyzcvgerem
title: Upgrade vitest and @vitest/coverage-v8 4.1.10 -> 4.1.11 (GHSA-82fw-gwwq-j7x9)
kind: chore
status: closed
priority: 1
version: 3
labels:
  - release
dependencies:
  - type: blocks
    target: is-01m44er4nc8tqwpzwj1g1ffrfs
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T21:57:29.704Z
updated_at: 2026-10-04T22:12:50.889Z
closed_at: 2026-10-04T22:12:50.889Z
close_reason: vitest + @vitest/coverage-v8 4.1.11; audit clean.
---
Dev-only. CVE-2026-84373 path traversal via @vitest/mocker redirect mock. 4.1.11 published 2026-08-18, provenance, same publisher. Stay on 4.x; vitest 5 is a major.
