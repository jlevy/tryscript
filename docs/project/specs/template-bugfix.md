# Bugfix Spec: [Defect]

- **Status:** investigating | active | complete
- **Severity:** [impact-based level]
- **Affected versions:** [versions or environments]
- **Bead:** [ID]

## User Impact

**Observed behavior:** [What users or systems see]

**Expected behavior:** [The contract that should hold]

**Impact:**
[Who is affected, frequency, data or security consequences, and whether a workaround exists]

## Scope

**In scope:** [failure paths and components this fix covers]

**Out of scope:** [nearby work and its tracking bead]

**Compatibility:** [behavior, API, data, or file-format guarantees to preserve]

## Reproduction

### Minimal Case

1. [Create the smallest required state or input]
2. [Perform the triggering action]
3. [Observe the exact incorrect result]

**Environment:** [version, platform, configuration, and relevant data]

**Evidence:** [failing test, log, trace, screenshot, or output]

### Related Scenarios

- [Boundary or variant that might share the cause]
- [Known unaffected case that narrows the fault]

## Root Cause

[Explain the causal chain from input to failure and cite the responsible code or data boundary. Distinguish confirmed evidence from hypotheses.]

## Fix Design

**Selected approach:** [Smallest complete fix]

**Why this approach:** [Correctness, compatibility, risk, and maintainability evidence]

**Alternatives rejected:**

- [Alternative and concrete reason]

### Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| [Regression or rollout risk] | [Test, guard, migration, or rollback] |

### Data, Configuration, or Migration Changes

[Required changes and rollback, or “None.”]

## Test-Driven Implementation

1. Add a failing regression for [minimal case].
2. Add boundary cases for [related scenarios].
3. Implement [targeted change].
4. Refactor while the regression stays green.
5. Run [focused and repository-wide quality gates].

| File | Change |
| --- | --- |
| `path/to/test` | [Regression coverage] |
| `path/to/source` | [Implementation] |

## Validation Results

- [ ] Minimal reproduction passes
- [ ] Related regressions pass
- [ ] Format, lint, strict types, build, and full tests pass
- [ ] Package, migration, security, or environment checks pass when applicable
- [ ] Documentation and release notes reflect user-visible behavior

Record final commands and results here or link a validation spec.

## Release and Recovery

**Release plan:** [Immediate, staged, or next patch release]

**Monitoring:** [Signal that confirms success or detects recurrence]

**Rollback:** [Code and data recovery path]

## Follow-Up

[List only owned beads or issues. Remove this section when there is no follow-up.]

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
