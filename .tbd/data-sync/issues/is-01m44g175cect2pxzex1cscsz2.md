---
type: is
id: is-01m44g175cect2pxzex1cscsz2
title: "requires: front matter and config: preflight commands and report resolution (gh#54)"
kind: feature
status: closed
priority: 1
version: 3
labels: []
dependencies: []
parent_id: is-01m44g16tt5kdwav5qkwq7neqp
created_at: 2026-10-04T22:19:57.484Z
updated_at: 2026-10-04T22:24:58.640Z
closed_at: 2026-10-04T22:24:58.640Z
close_reason: "Implemented: src/lib/requires.ts, run preflight, docs, 12 tests."
---
Named commands must resolve against the same composed PATH the sessions get (path: entries included) before any session runs; abort naming the command, file, and directories searched; report 'resolved <cmd> -> <path> (N files, M sessions)'. PATHEXT on Windows. Bare command names only. Merge project config and front matter by union.
