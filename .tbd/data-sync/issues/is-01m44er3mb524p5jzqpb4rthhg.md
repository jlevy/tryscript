---
type: is
id: is-01m44er3mb524p5jzqpb4rthhg
title: Re-resolve @humanfs/node to 0.16.8 (GHSA-p498-v437-472g)
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
created_at: 2026-10-04T21:57:30.378Z
updated_at: 2026-10-04T22:12:51.593Z
closed_at: 2026-10-04T22:12:51.593Z
close_reason: Floor override @humanfs/node@<0.16.8 -> 0.16.8. pnpm update --depth Infinity also dragged rollup 4.63.4 (+@napi-rs/lzma native optional dep) and postcss, so an override was used instead. eslint not bumped (see try-bjb8).
---
Dev-only via eslint. eslint 10.8.0 allows ^0.16.6; 0.16.8 published 2026-04-17, same publisher, adds @humanfs/types. Re-resolve without bumping eslint.
