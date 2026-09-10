# Capping query duration on the request path

A runaway query holds one of the two pool slots of its lambda until the server cancels it. With
`max: 2` in `src/lib/db.ts`, two of them starve that lambda, and every other request it is handling
fails with `timeout exceeded when trying to connect` once `connectionTimeoutMillis` elapses. That is
the shape behind the connection-timeout issues tracked as POLIGRAPH-V and POLIGRAPH-1C.

The obvious remedy, capping statement duration from the client, does not work here. This document
records what was measured, so the next reader does not repeat it, and describes the one path that
would work.

Do not paste connection strings, host names, keys, or role passwords into this document, a pull
request, an issue, or CI output.

## What was measured

All figures come from production on 2026-09-10, from sessions opened by the same pool the
application uses.

| Mechanism                                            | Effect on `SHOW statement_timeout` |
| ---------------------------------------------------- | ---------------------------------- |
| `statement_timeout` in the `pg.Pool` config          | none, server default stands        |
| `options=-c statement_timeout=...` startup parameter | none, server default stands        |
| both together                                        | none, server default stands        |
| `SET statement_timeout` in session                   | applied                            |

The server default is two minutes, not the thirty seconds the pool config used to claim. That claim
has been removed and `src/lib/__tests__/db-pool-config.test.ts` fails if the option comes back.

## Why a session SET cannot be used from the pool

The pooler reuses physical backends across unrelated clients and does not reset session state
between them. Measured: one pool sets a distinctive `statement_timeout`, disconnects, and a second
pool built from scratch reads that same value on the same backend. Thirty consecutive connections
from fresh pools landed on a single backend.

Two consequences:

1. A cap applied on connect would leak onto whatever reuses that backend next, including the batch
   jobs in `src/services/sync/` that legitimately run for minutes. The daily sync tolerates a failed
   step, so the failure would be survivable but silent in intent and hard to attribute.
2. Any diagnostic session that issues `SET` pollutes a backend serving live traffic. Always `RESET`
   afterwards and confirm from fresh connections with `current_setting()`.

`SET LOCAL` inside an explicit transaction is the only leak-free variant, because its scope ends
with the transaction. It would force a transaction and an extra round trip on every page read across
the data layer, which is why it is not the recommended path.

## Recommended path: a dedicated role for the request path

Give the application's read path its own PostgreSQL role carrying its own `statement_timeout`, and
leave the batch jobs on the current role. The cap then lives on the server, where the pooler cannot
strip it and session reuse cannot leak it, because it is a property of the role rather than of the
session.

### Preconditions

1. Confirm the current server default and the role in use, recording only the values, in the private
   change record.
2. Decide the cap from measured page-query durations, not from intuition. The three heaviest queries
   in the codebase belong to `src/services/sync/compute-municipales-snapshots.ts` and average ten,
   six and three seconds; they must stay on the batch role.
3. Identify the operator and the rollback owner.

### Steps

1. Create the role in the Supabase Dashboard, grant it exactly the privileges the request path needs
   and no more, and set its `statement_timeout`.
2. Add a separate connection string for the request path to the hosted environment variables. Keep
   the existing variable pointing at the batch role so scripts, crons and Inngest functions are
   untouched.
3. Teach `src/lib/db.ts` to select the request-path connection string when one is present, falling
   back to the existing variable so local development and scripts keep working unchanged.
4. Deploy, then verify.

### Verification

1. From a request-path session, `SHOW statement_timeout` returns the new cap.
2. From a script session, it still returns the server default.
3. A deliberately slow read on the request path is cancelled with SQLSTATE `57014` at the cap, and
   the page renders an error rather than holding a pool slot.
4. The daily sync completes with the same step results as before the change.

### Rollback

Remove the request-path connection string from the hosted environment and redeploy. The fallback in
step 3 restores the previous behaviour without a code change.

## Still unknown

What consumed the connections during the 2026-09-03 incident window is not established. Deploys, the
Inngest schedule and a database restart were each checked and ruled out. The remaining candidates,
a traffic surge and a heavy script run by hand against production, need the hosted observability for
that window, including the pooler's own client metrics.

Alerting on the connection-timeout rate should come before any further change, so the next
occurrence is caught while that observability still covers it.

## References

- `src/lib/db.ts` for the pool configuration and the reason the option is absent
- `src/lib/__tests__/db-pool-config.test.ts` for the guard
- `src/inngest/functions/sync-daily.ts` for the step-level failure tolerance relied on above
