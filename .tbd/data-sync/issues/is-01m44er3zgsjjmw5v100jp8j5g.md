---
type: is
id: is-01m44er3zgsjjmw5v100jp8j5g
title: Convert picomatch 4 override from exact pin to security floor
kind: chore
status: closed
priority: 2
version: 3
labels:
  - release
dependencies:
  - type: blocks
    target: is-01m44er4nc8tqwpzwj1g1ffrfs
parent_id: is-01m44er1ynvgj6bkr7vaja524r
created_at: 2026-10-04T21:57:30.735Z
updated_at: 2026-10-04T22:12:51.915Z
closed_at: 2026-10-04T22:12:51.914Z
close_reason: "Override now a floor (<4.0.5). micromatch>picomatch override removed (micromatch left the tree). Dev lockfile keeps 4.0.5; consumer install of the packed tarball resolves 4.0.7 and discovery parity was re-run against it (4.0.5..4.0.7 diff reviewed: parser/scan logic only)."
---
picomatch@>=4.0.0 <5 -> 4.0.5 pins every picomatch 4. tinyglobby brings picomatch ^4.0.4 into the runtime tree, and consumers resolve 4.0.7. Make the override a floor (<4.0.5) so the lockfile tests the version consumers get. Drop the micromatch>picomatch override if micromatch leaves the tree.
