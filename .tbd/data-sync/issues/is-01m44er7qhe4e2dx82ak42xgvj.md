---
type: is
id: is-01m44er7qhe4e2dx82ak42xgvj
title: "Deferred: re-evaluate tsx pin (4.23.1) after 4.23.15 repackaging"
kind: chore
status: open
priority: 3
version: 1
labels:
  - supply-chain
dependencies: []
created_at: 2026-10-04T21:57:34.576Z
updated_at: 2026-10-04T21:57:34.576Z
---
tsx is an exact-pinned runtime dependency used to load TS configs. 4.23.15 (2026-09-20, 2h after 4.23.14) restructures dist (50 -> 30 files, new imports map). No advisory against 4.23.1. Bump only with a concrete reason, after verifying tsx/cjs/api loading on Node 20.0, 22, 24.
