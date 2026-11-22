import { z } from "zod/v4";

const param = z.string().max(2048).nullable().optional();

/** Consent decision posted by /admin/oauth/autoriser: the raw OAuth request, revalidated server-side. */
export const oauthConsentSchema = z.object({
  decision: z.enum(["approve", "deny"]),
  response_type: param,
  client_id: param,
  redirect_uri: param,
  code_challenge: param,
  code_challenge_method: param,
  state: param,
  scope: param,
  resource: param,
});
