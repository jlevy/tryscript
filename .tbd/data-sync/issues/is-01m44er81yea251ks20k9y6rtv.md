---
type: is
id: is-01m44er81yea251ks20k9y6rtv
title: "Deferred: major upgrades (TS 7, vitest 5, tsdown 0.23, c8 12, commander 15, diff 9, zod 4, ncu 23, pnpm 11+)"
kind: chore
status: open
priority: 3
version: 1
labels:
  - upgrades
dependencies: []
created_at: 2026-10-04T21:57:34.910Z
updated_at: 2026-10-04T21:57:34.910Z
---
Out of scope for a patch release. Runtime majors (commander, diff, zod) can change CLI/API behavior; dev majors need migration work. @types/node stays on 20.x to match the Node 20 engine contract. @types/diff 8 is unnecessary since diff ships its own types.
