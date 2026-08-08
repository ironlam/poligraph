# SEC-02 hosted Data API cutover

This runbook controls the hosted deployment step for SEC-02. The application uses a direct,
server-side PostgreSQL connection. It does not require Supabase's generated REST or GraphQL data
surface.

The repository cannot declare the hosted switch. A local `supabase/config.toml` setting would only
control a local Supabase stack, so it must not be treated as the production source of truth. The
hosted state is managed in the Supabase Dashboard and verified after every change.

Do not paste project URLs, keys, request paths, object names, payloads, or returned data into this
document, a pull request, an issue, or CI output. The authorized private Security Advisory contains
the detailed evidence and verification case.

## Preconditions

1. Confirm the SEC-02 gate remains `READY_TO_DISABLE` from both repository inspection and a
   representative read-only traffic window.
2. Confirm `npm run test:security:data-path` and the standard local verification suite pass.
3. Confirm the current hosted Data API state in the Supabase Dashboard and record only
   `enabled` or `disabled` in the private change record.
4. Identify the operator and rollback owner. Keep the Dashboard open for immediate rollback.

Stop if a legitimate consumer appears or if the traffic evidence is no longer sufficient.

## Controlled cutover

1. Open the hosted project's **Data API integration overview** in the Supabase Dashboard.
2. Turn **Enable Data API** off and save the setting.
3. Do not change exposed schemas, database grants, RLS policies, functions, or application secrets
   as part of this cutover.

This Dashboard action follows Supabase's current hosted-project guidance. It is separate from local
CLI configuration.

## Immediate verification

Record pass or fail only. Keep detailed requests in the private Security Advisory.

1. Run the authorized private negative check and confirm the generated public data surface is
   unavailable.
2. Run a read-only server-path health check through the deployed application and confirm its direct
   PostgreSQL connection still succeeds.
3. Smoke-test the home page, politician listing, judicial-affairs listing, parliamentary votes,
   elections, and one documented public `/api` response.
4. Check application and scheduled-job errors for an unexpected dependency on the removed surface.
5. Recheck hosted API traffic after the cutover for failed requests that look like a legitimate
   integration rather than scanning or the authorized security verification.

The finding remains `In remediation` until an independent Adversary and Verifier confirm the
deployed state and all required GitHub checks pass.

## Rollback

Rollback immediately if a legitimate integration is identified or a primary application surface
fails because of the cutover:

1. Re-enable **Enable Data API** in the same hosted Dashboard integration screen.
2. Repeat the server-path and public-site smoke checks.
3. Record only the high-level reason and result publicly. Put access details in the private
   Security Advisory.
4. Keep SEC-02 open and decide whether the consumer must migrate to the application API or whether
   a narrowly designed public schema is required under a separate security review.

Rollback does not include bulk grant changes, RLS rewrites, or function privilege changes. Those
belong to SEC-03 and SEC-06 unless they become strictly necessary to close SEC-02.

## References

- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [SEC-02 finding register](../audits/security-ux-baseline-2026-08.md#sec-02-prevent-alternate-path-disclosure-of-unpublished-data)
