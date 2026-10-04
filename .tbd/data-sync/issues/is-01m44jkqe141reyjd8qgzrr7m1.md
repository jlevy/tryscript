---
type: is
id: is-01m44jkqe141reyjd8qgzrr7m1
title: Extend Windows CI beyond discovery and requires
kind: task
status: open
priority: 3
version: 1
labels:
  - ci
dependencies: []
created_at: 2026-10-04T23:05:01.121Z
updated_at: 2026-10-04T23:05:01.121Z
---
Review finding 6 (PR #58): the windows-latest job covers only discovery.test.ts and requires.test.ts, and the requires CLI cases are POSIX-only. composeSessionEnvironment (';' splitting, Path vs PATH env key), the empty path: drop, and an end-to-end run are unexercised on Windows. Add runner.test.ts and a .cmd-based requires CLI case, fixing what that surfaces.
