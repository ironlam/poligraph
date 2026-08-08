## Finding

<!-- SEC-*, CI-*, DB-*, UX-*, or AGENT-* identifier. -->

## Root cause

<!-- Describe the evidence-based cause, not only the observed symptom. -->

## Regression or attack scenario

<!-- Describe a safe, concrete scenario that violated the invariant before remediation. -->
<!-- For an unresolved exploitable security finding, do not include exploit-enabling evidence in a public PR. Reference the private security advisory instead. -->

## Before-proof or reproduction

<!-- Link the red test, measurement, or bounded manual reproduction. Exclude secrets and personal data. -->
<!-- For an unresolved exploitable security finding, do not include exploit-enabling evidence in a public PR. Reference the private security advisory instead. -->

## Correction

<!-- Explain the smallest correction and why it preserves product and editorial invariants. -->

## After-tests

<!-- List exact commands, measurements, and results. Include required GitHub CI before merge. -->

## Affected invariants

<!-- Link the finding register and name every security, business, editorial, UX, or performance invariant. -->

## Adversary and independent verification

<!-- Record the second context, bypass attempts, regressions considered, and unresolved blockers. -->
<!-- For an unresolved exploitable security finding, do not include exploit-enabling evidence in a public PR. Reference the private security advisory instead. -->

## Out of scope

<!-- List related work deliberately excluded from this PR. -->

## Rollback

<!-- Required for risky changes. For DB work, include the versioned rollback or forward-fix plan. -->

## Domain-specific evidence

<!-- DB: metric or EXPLAIN before and after. UI: relevant mobile, desktop, keyboard, and axe checks. -->

## Checklist

- [ ] The living findings register has current status, owner, evidence, PR, and last-updated values
- [ ] The Implementer did not self-certify the change
- [ ] The standard local verification suite passed before opening the PR
- [ ] Required GitHub CI passes before merge
- [ ] No sensitive data is included in code, logs, evidence, or this PR
