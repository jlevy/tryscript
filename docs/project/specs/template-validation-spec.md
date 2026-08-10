# Validation Spec: [Feature or Task]

- **Status:** planned | in progress | complete
- **Plan spec:** [plan filename]
- **Implementation spec:** [implementation filename]
- **Date:** YYYY-MM-DD

## Validation Goal

[State what must be true for the implementation to be accepted, including supported environments and important failure behavior.]

## Acceptance-Criteria Coverage

| Acceptance Criterion | Evidence | Status |
| --- | --- | --- |
| [Observable requirement] | [Automated test, artifact, or manual check] | pending |

## Automated Validation

| Layer | Command or Check | Coverage | Result |
| --- | --- | --- | --- |
| Unit | `[command]` | [Logic and edge cases] | pending |
| Integration | `[command]` | [Boundary and failure paths] | pending |
| End to end | `[command]` | [User workflow and environment] | pending |
| Quality | `[command]` | [Format, lint, types, build, audit] | pending |

Record the final command, environment, date, and result.
Link large logs or reports instead of pasting them.

## Manual Validation

Include only behavior that cannot be verified reliably in automation.

1. **Setup:** [exact environment and data]
2. **Action:** [specific user action]
3. **Expected result:** [observable content, state, and styling]

Use screenshots for visual work and record platform or browser details.
If no manual validation is needed, state “None; all acceptance criteria are automated.”

## Failures, Gaps, and Follow-Up

| Item | Impact | Resolution or Bead |
| --- | --- | --- |
| [Failure or untested edge] | [Release consequence] | [Fix, owner, or bead ID] |

## Final Assessment

- **Result:** pass | fail | blocked
- **Reviewed by:** [name]
- **Evidence date:** YYYY-MM-DD

[Explain the result and any release conditions in one concise paragraph.]

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
