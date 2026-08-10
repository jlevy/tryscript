---
type: is
id: is-01kzm4n5ghygppnk98azaq6j6j
title: "Pre-existing: dist/*.cjs throws ERR_REQUIRE_ESM at require('strip-ansi') on Node 20"
kind: bug
status: closed
priority: 1
version: 2
labels: []
dependencies: []
created_at: 2026-08-09T20:50:30.032Z
updated_at: 2026-08-10T00:50:13.329Z
closed_at: 2026-08-10T00:50:13.328Z
close_reason: Fixed by bundling ESM-only runtime dependencies into the CommonJS build and verified by packed-artifact require smoke tests on exact Node 20.0.0.
---
