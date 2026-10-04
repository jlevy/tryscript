---
type: is
id: is-01kzm71yem15c1njf922swmcjq
title: Make tbd-generated hooks honor supply-chain-safe executable pins
kind: bug
status: closed
priority: 3
version: 3
labels:
  - upstream-tbd
  - supply-chain
dependencies: []
created_at: 2026-08-09T21:32:25.939Z
updated_at: 2026-10-04T22:28:57.456Z
closed_at: 2026-10-04T22:28:57.456Z
close_reason: "Resolved by tbd 0.10.0: gh helper installs through a private mktemp dir; fallback pin read from .tbd/config.yml."
resolution: null
duplicate_of: null
---
tbd 0.4.2 setup regenerates Codex helpers with get-tbd@0.4.2 inside the 14-day cool-off and restores predictable /tmp/gh_* installation paths. Tryscript must keep a reviewed local divergence, so tbd doctor reports the managed hooks stale. Fix the upstream generator to select an eligible pin and private atomic gh installation, then refresh this repo and remove the divergence.
