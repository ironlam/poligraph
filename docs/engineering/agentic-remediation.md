# Agentic remediation protocol

This protocol is mandatory for every work package identified by `SEC-*`, `CI-*`, `DB-*`, `UX-*`, or
`AGENT-*`. The reference register is
[`docs/audits/security-ux-baseline-2026-08.md`](../audits/security-ux-baseline-2026-08.md).

One person may coordinate the work package, but an agent or context must not self-certify its own
change. Scout, Implementer, and Verifier describe responsibilities. The Adversary role and final
verification must use a sufficiently independent second context that challenges the implementation
assumptions.

## 1. Scout

The Scout:

- reads the code and repository rules;
- reproduces the issue without dangerous actions;
- traces callers, consumers, dependencies, and alternative paths;
- measures when necessary;
- produces an evidence-based root cause analysis;
- defines the invariants and out-of-scope elements;
- does not modify code.

The Scout report cites relevant files and lines, reproducible commands, unconfirmed assumptions,
and any data that must not be copied into the PR.

## 2. Reproduction

Before remediation, produce a test that fails with the current behavior whenever possible. The test
must demonstrate the violated invariant, not merely mirror the current implementation shape.

For a vulnerability:

- reproduce only in a test or isolated environment;
- perform no dangerous action against production or an external service;
- use harmless, minimal payloads;
- encode the reproduction in an automated test;
- retain before-evidence without secrets or personal data.

If an automated test is impossible, the PR explains why and provides a bounded, safe, reproducible
manual procedure.

### Public vs private security evidence

For a security finding that remains exploitable:

- keep the public register minimal;
- store detailed reproduction evidence in an authorized private channel, preferably a GitHub
  Repository Security Advisory;
- do not include payloads, procedures, or evidence that facilitate exploitation in a public PR;
- let `Before-proof`, `Regression or attack scenario`, and `Adversary` reference the private
  advisory;
- prove publicly that regression tests exist without exposing dangerous test data or procedures;
- document details publicly after remediation when coordinated disclosure is appropriate.

Security through obscurity is not the control. The objective is coordinated disclosure while a
known vulnerability remains exploitable.

## 3. Implementer

The Implementer:

- fixes only the finding in scope;
- chooses the smallest correction that preserves the invariants;
- preserves or improves source traceability;
- does not turn the work package into an unrelated refactor;
- documents tradeoffs and out-of-scope elements.

An independent issue discovered during implementation receives a separate finding or PR. All LLM
outputs are treated as untrusted data.

## 4. Adversary

A second context or agent examines the correction without simply rereading the Implementer's
rationale. It actively looks for:

- a bypass or alternative payload;
- a business regression;
- an editorial regression;
- an incorrect assumption about data or callers;
- a responsive or accessibility regression for UI work;
- a performance regression for database work.

The Adversary provides concrete scenarios, separates blockers from suggestions, and references the
affected invariants. The Implementer addresses blockers, then the Verifier reruns the evidence.

## 5. Verifier

The Verifier selects controls proportionate to the work package from:

- TypeScript;
- ESLint;
- Prettier;
- unit tests;
- security tests;
- build;
- database tests;
- Playwright;
- axe;
- SQL measurements.

Only relevant controls run during iteration. The standard local verification suite runs before
opening the PR. Required GitHub CI must pass before merge. The Verifier records exact commands,
results, and any skipped control with its rationale. The Verifier also confirms that the diff
remains within the declared scope.

## 6. PR

Every remediation PR documents:

- Finding;
- Root cause;
- Regression or attack scenario;
- Before-proof or reproduction;
- Correction;
- After-tests;
- Affected invariants;
- Out-of-scope elements;
- Rollback when the change is risky.

Start from `.github/PULL_REQUEST_TEMPLATE/remediation.md` so these fields remain visible and
consistent. When creating a PR through CLI or API, explicitly read and populate that file. Do not
assume GitHub applies it automatically. The PR also updates the corresponding row in the living
findings register.

A database PR includes the metric or `EXPLAIN` before and after. A UI PR includes relevant mobile
and desktop verification. Results from the second context are visible in the description or review.

## Working rules

- An agent must not self-certify its own change.
- Do not modify production directly to make production match the code.
- Permanent database changes must be versioned.
- Supabase production may be queried read-only for measurement when available tools permit it.
  Sensitive results remain outside the repository and PR.
- Experiments must use an isolated environment.
- Prefer PostgreSQL 17 under Docker for local database tests.
- Never turn a Supabase Advisor recommendation into an automatic change without analysis.
- Do not optimize a query solely because an index appears to be missing.
- Treat every LLM output as untrusted data.
- Poligraph's editorial rules take priority over technical optimizations.
- Apply criteria identically to all parties and people.
- No judicial-data change may bypass publication, matching, or presumption-of-innocence guards.

## Sequence and minimum evidence

| Phase        | Input              | Required output                              | Writes code   |
| ------------ | ------------------ | -------------------------------------------- | ------------- |
| Scout        | Versioned finding  | Root cause, scope, callers, measurement      | No            |
| Reproduction | Root cause         | Red test or justified safe procedure         | Test only     |
| Implementer  | Before-evidence    | Minimal correction and targeted tests        | Yes           |
| Adversary    | Diff and invariant | Bypass attempts and regression scenarios     | No by default |
| Verifier     | Revised diff       | Independent results, local checks, GitHub CI | No by default |
| PR           | All evidence       | Complete description and suitable rollback   | No            |

A finding can be marked `Verified` only when the before-evidence demonstrates behavior or a metric
that violates the invariant, the after-evidence satisfies the invariant, and the second context has
no unresolved blocker.
