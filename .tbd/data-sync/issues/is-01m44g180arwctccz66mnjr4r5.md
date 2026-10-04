---
type: is
id: is-01m44g180arwctccz66mnjr4r5
title: Upgrade tbd to v0.10.0 (first-party, cool-off exempt per user)
kind: chore
status: closed
priority: 2
version: 4
labels: []
dependencies:
  - type: blocks
    target: is-01m44g18bye28fnzdvqsxqjqax
parent_id: is-01m44g16tt5kdwav5qkwq7neqp
created_at: 2026-10-04T22:19:58.346Z
updated_at: 2026-10-04T22:28:57.062Z
closed_at: 2026-10-04T22:28:57.061Z
close_reason: "Upgraded; see commit 'chore: upgrade tbd to v0.10.0'. tbd-sync repaired separately (try-qp14)."
resolution: null
duplicate_of: null
---
Run tbd setup --auto with get-tbd@0.10.0, commit the managed-file diff, re-check try-pn34 (hook pins) and the tbd-sync gitignore defect.
