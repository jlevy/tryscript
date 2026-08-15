---
type: is
id: is-01kzm85g8zf1ys6p4d0cy3ck3v
title: Load documented TypeScript config files on the Node 20 runtime contract
kind: bug
status: closed
priority: 1
version: 7
spec_path: docs/project/specs/active/spec-v0.2.0-stability-review.md
labels:
  - pr-review
  - pr-48
dependencies: []
parent_id: is-01kzm4z425gqmnfts7k93dqrbt
created_at: 2026-08-09T21:51:51.070Z
updated_at: 2026-08-10T01:12:46.264Z
closed_at: 2026-08-10T00:34:09.068Z
close_reason: Implemented with regression coverage; all local non-security quality, build, package, unit, golden, and coverage gates pass.
---
Architecture/doc audit found that loadConfig() advertises tryscript.config.ts but uses native import(), which cannot load .ts on the package's declared Node 20 minimum. Add a packed-artifact Node 20 regression and make documented TypeScript configs load without weakening package or supply-chain guarantees.
