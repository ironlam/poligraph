# Security, architecture, performance, and UX baseline, August 2026

This document is the versioned, living register of findings selected for Poligraph's agentic
remediation program. It records risks, target invariants, and current remediation state. Git history
preserves the original audit snapshot and every subsequent status change. This document is not
evidence of production exploitation, authorization to modify production, or a remediation of any
finding.

## Baseline metadata

| Field                 | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Work package          | `AGENT-00`                                                                         |
| Baseline date         | August 8, 2026                                                                     |
| Inspected revision    | `a24fcc13`                                                                         |
| Reference branch      | `origin/main`                                                                      |
| Registry last updated | August 8, 2026                                                                     |
| Required protocol     | [`docs/engineering/agentic-remediation.md`](../engineering/agentic-remediation.md) |

The evidence below consists of starting points observed in the repository. The Scout for each work
package must verify them against the current code and, when needed, an authorized measurement
environment. Any claim about production data must be confirmed by a read-only measurement.

## Register statuses

- `To investigate`: initial context is versioned, but reproduction and scope remain to be confirmed.
- `Confirmed`: a safe reproduction or measurement is available.
- `In remediation`: a dedicated pull request is open.
- `Verified`: a context distinct from the Implementer has tested the remediation.
- `Closed`: the remediation is merged and the after-evidence is archived.
- `Accepted`: the risk is explicitly accepted with an owner, rationale, and review date.

A finding must not move directly from `To investigate` to `Closed`. The remediation PR must retain
links to the before and after evidence under the finding identifier.

Every remediation PR updates its finding row. It sets the status to `In remediation`, assigns an
owner, links the evidence and PR, and refreshes `Last updated`. Before merge, it may advance the
status to `Verified` only after independent verification. After merge, a follow-up documentation
change marks it `Closed`. Accepted risks retain their rationale and next review date in `Evidence`.
`Unassigned` and `None` are explicit values, not fields to leave blank.

## Overview

| Identifier | Priority           | Area                  | Current status | Owner      | Evidence                                                                    | Remediation PR                                        | Last updated |
| ---------- | ------------------ | --------------------- | -------------- | ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ------------ |
| `SEC-01`   | P0                 | Application security  | Closed         | @ironlam   | Private Security Advisory                                                   | [#692](https://github.com/ironlam/poligraph/pull/692) | 2026-08-08   |
| `SEC-02`   | P0                 | Access control        | Closed         | @ironlam   | Private Security Advisory                                                   | [#694](https://github.com/ironlam/poligraph/pull/694) | 2026-08-12   |
| `SEC-03`   | P1                 | Supabase              | Verified       | @ironlam   | Private Security Advisory                                                   | [#713](https://github.com/ironlam/poligraph/pull/713) | 2026-08-13   |
| `SEC-04`   | P1                 | Authentication        | To investigate | Unassigned | [Context](#sec-04-harden-admin-authentication)                              | None                                                  | 2026-08-08   |
| `SEC-06`   | P1                 | Database security     | To investigate | Unassigned | [Context](#sec-06-database-function-privilege-hardening)                    | None                                                  | 2026-08-08   |
| `SEC-07`   | P2                 | Application security  | To investigate | Unassigned | [Context](#sec-07-csp-hardening-without-sacrificing-rendering-architecture) | None                                                  | 2026-08-08   |
| `CI-01`    | P1                 | CI                    | To investigate | Unassigned | [Context](#ci-01-make-security-guards-trustworthy)                          | None                                                  | 2026-08-08   |
| `CI-02`    | P1                 | Quality               | To investigate | Unassigned | [Context](#ci-02-bring-scripts-under-static-analysis)                       | None                                                  | 2026-08-08   |
| `SEC-05`   | P1                 | Software supply chain | To investigate | Unassigned | [Context](#sec-05-software-supply-chain-baseline)                           | None                                                  | 2026-08-08   |
| `DB-01`    | Measurement-driven | Database performance  | To investigate | Unassigned | [Context](#db-01-incremental-group-position-computation)                    | None                                                  | 2026-08-08   |
| `DB-02`    | Continuous         | Database performance  | To investigate | Unassigned | [Context](#db-02-top-sql-workload-remediation)                              | None                                                  | 2026-08-08   |
| `DB-03`    | Measurement-driven | Database performance  | To investigate | Unassigned | [Context](#db-03-evaluate-foreign-key-indexing-from-measured-workloads)     | None                                                  | 2026-08-08   |
| `UX-01`    | P1                 | UX and quality        | To investigate | Unassigned | [Context](#ux-01-convert-recurring-ux-defects-into-semantic-contracts)      | None                                                  | 2026-08-08   |
| `AGENT-01` | P1                 | Governance            | To investigate | Unassigned | [Context](#agent-01-make-agentsmd-executableverifiable)                     | None                                                  | 2026-08-08   |

## P0 findings

### SEC-01: Prevent active content injection from rich text

**Target invariant.** Untrusted editorial, external, or AI-generated rich text must never create
executable active content in the application.

Exploit-enabling evidence is tracked privately until remediation.

**Closure criteria.** Untrusted rich text is rendered through a safe construction method, regression
tests enforce the invariant, and a distinct Adversary has completed private bypass testing.

**Mapping.** [OWASP Top 10:2025](https://owasp.org/Top10/) A05:2025 Injection. A08:2025 Software or
Data Integrity Failures when data comes from an AI pipeline.

### SEC-02: Prevent alternate-path disclosure of unpublished data

**Target invariant.** Unpublished data must never become publicly accessible through an alternate
data-access path.

Exploit-enabling evidence and access details are tracked privately until remediation.

**Closure criteria.** Role-based tests reject unpublished data through every public path, allow only
the intentional public surface, and confirm that versioned controls, deployed state, and
documentation are aligned.

**Mapping.** [OWASP Top 10:2025](https://owasp.org/Top10/) A01:2025 Broken Access Control. A02:2025
Security Misconfiguration.

## P1 findings

### SEC-03: Least-privilege Supabase public surface

**Goal.** Explicitly decide whether the Data API should exist. Disable it if it is unnecessary. If
it is required, expose only explicitly public views, tables, and columns, then review grants,
policies, and RPC functions according to least privilege.

**Required investigation.** Inventory actual clients, public keys, exposed schemas, privileges by
role, `SECURITY DEFINER` functions, and external dependencies. Do not infer production state from
manual SQL files alone.

**Closure criteria.** The architecture decision is documented, the required surface is tested by
role, and every unintended access fails closed.

### SEC-04: Harden admin authentication

**Observed context.** The current code uses `ADMIN_PASSWORD` both to verify the password and as the
HMAC key for a stateless session cookie valid for seven days. A missing variable fails closed. The
work package must verify, without assuming presence or absence:

- separation between the password and the session secret;
- session duration;
- revocation;
- distributed login-attempt rate limiting;
- fail-closed production behavior;
- a future MFA path that does not require rewriting the architecture.

**Closure criteria.** The threat model, session properties, rotation, and revocation are tested. The
remediation supports a future MFA addition and does not weaken existing access controls.

### CI-01: Make security guards trustworthy

**Observed context.** `.github/workflows/code-quality.yml` contains several useful guards. The
`No JSON.parse of user input without try-catch` guard uses `grep | while ...`; its `FOUND=1`
assignment occurs in a Bash subshell and can be lost before `exit $FOUND`.

**Target invariant.** Every critical guard must include a deliberately invalid case that fails the
guard and a valid case that passes.

**Closure criteria.** Critical guards are extracted or structured for testing, their positive and
negative tests run in CI, and shell failure modes are explicit.

### CI-02: Bring scripts under static analysis

**Observed context.** `eslint.config.mjs` excludes `scripts/**`, although the directory contains
importers, synchronization jobs, migrations, purge jobs, backfills, and AI processing. TypeScript
includes most `.ts` files except `scripts/tmp-*`, but this does not replace ESLint rules.

**Goal.** Define suitable static analysis for scripts without hiding issues through a global
exclusion. Necessary exceptions must be narrow, justified, and tested.

**Closure criteria.** Durable scripts pass a versioned configuration, temporary scripts follow the
repository exit convention, and relevant security rules cover operational paths.

### SEC-05: Software supply-chain baseline

**Observed context.** Workflows reference `actions/checkout@v4`, `actions/setup-node@v4`, and
`actions/github-script@v7`, among others, without SHA pinning. No CodeQL, Dependency Review, or
Dependabot configuration file was found under `.github/` at this revision. The npm lockfile is
versioned and CI jobs use `npm ci`.

**Required evaluation.** Evaluate CodeQL, Dependency Review, Dependabot or an equivalent, dependency
auditing, and GitHub Action SHA pinning where appropriate. Document cadence, ownership, blocking
thresholds, false-positive handling, and the SHA update process.

**Closure criteria.** The repository has a reproducible baseline, alerts have a triage path, and any
decision not to adopt a control is justified and dated.

**Mapping.** [OWASP Top 10:2025](https://owasp.org/Top10/) A03:2025 Software Supply Chain Failures.

### SEC-06: Database function privilege hardening

**Target invariant.** Database functions must execute with explicit, least-privilege semantics and
must not unintentionally expose privileged operations to public roles.

Exploit-enabling evidence and privilege details are tracked privately until remediation.

**Closure criteria.** Function behavior and effective privileges are inventoried, object resolution
is explicit where required, unnecessary execution rights are removed, intentional public API
behavior is preserved, and tests verify access by role.

### SEC-07: CSP hardening without sacrificing rendering architecture

**Target invariant.** Browser security policy should reduce the impact of injection vulnerabilities
without introducing unjustified regressions to static rendering, ISR, caching, or performance.

**Required investigation.** Evaluate the current policy and relevant sinks, nonce-based policy,
hash and SRI options, App Router rendering and cache compatibility, performance cost, and
architectural impact.

**Closure criteria.** A measured decision is documented and covered by CSP tests. CSP remains
defense in depth and is not treated as a substitute for correcting injection sinks.

## Performance

### DB-01: Incremental group-position computation

**Measurement context.** The audit observed a query related to group-position computation at around
11 to 12 seconds. `AGENT-00` did not reproduce this measurement. The query already uses indexes, so
an additional index is not the default conclusion.

**Goal.** Reduce the amount of executed work, potentially through incremental computation,
projection, or materialization when measurements justify it.

**Closure criteria.** The work package preserves the reference query and dataset, measures before
and after, verifies result freshness, and demonstrates no functional regression.

### DB-02: Top SQL workload remediation

**Principle.** Prioritize with `pg_stat_statements` using frequency multiplied by cost, then user
impact. A slow but rare query does not automatically rank above a faster query that dominates total
time or blocks an important citizen-facing surface.

Every optimization documents:

1. the before measurement;
2. the hypothesis;
3. the change;
4. the after measurement;
5. the absence of regression.

Production measurements are read-only. Experiments and writes use an isolated environment,
preferably PostgreSQL 17 under Docker.

### DB-03: Evaluate foreign-key indexing from measured workloads

**Target invariant.** Indexes must be justified by observed workload, cardinality, write cost, and
measured query behavior rather than advisor output alone.

**Required investigation.** For every candidate, evaluate cardinality, real joins, delete and update
patterns, frequency, write cost, and whether an existing index already covers the need.

**Closure criteria.** Every adopted index has before and after measurements. Every rejected index
has a documented rationale.

## UX and quality

### UX-01: Convert recurring UX defects into semantic contracts

Recurring defects must become testable invariants or explicit review checks:

- `unknown !== false`;
- a past or future state derived from dates must not be hard-coded;
- the displayed count and rendered collection must share the same predicate;
- a link label must describe its actual destination;
- AI-generated content is not verified content;
- important public information must retain its source;
- state must never be communicated through color alone;
- no horizontal overflow from 320 px upward;
- no new serious axe violation.

**Closure criteria.** Every invariant has a reference location, a suitable verification method, and
at least one regression example. Editorial contracts remain more important than compactness or
engagement.

## Governance

### AGENT-01: Make AGENTS.md executable/verifiable

**Goal.** For every critical `AGENTS.md` rule, progressively determine whether it can be derived
automatically from code, tested, or verified in CI. Rules that cannot be automated retain an owner
and an explicit review checklist.

**Drift risk.** A documentation rule can describe a variable, architecture, or guard that no longer
exists. Conversely, code can add a new public or operational path without updating the document.
Text-only automation can also remain green because a comment names a signal that has disappeared
from executable code.

**Closure criteria.** An inventory links every critical rule to its source of truth, test, or review.
CI detects automatable divergence, and exceptions are narrow and justified.

## Baseline limitations

`AGENT-00` remediates no finding. It changes no product behavior, route, Prisma model, migration,
Supabase configuration, or business rule. Every remediation receives a dedicated PR and follows the
agentic protocol linked above.

## Documentation drift corrected in AGENT-00

`AGENTS.md` and `README.md` still referred to `ADMIN_TOKEN`. The code, `.env.example`, visual tests,
and setup script use `ADMIN_PASSWORD`. These two documentation references were aligned with the
actual name. No authentication code, secret, or session behavior was changed.
