import { Redis } from "@upstash/redis";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";
import {
  AUTHORIZATION_CODE_TTL_SECONDS,
  OAuthConfigError,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./config";
import { digestToken, generateOpaqueToken } from "./tokens";

/**
 * Authorization codes and refresh tokens live in Upstash Redis, keyed by digest. Both are single-use:
 * GETDEL makes the read and the deletion one atomic step, so a code cannot be exchanged twice.
 */

export interface OAuthKv {
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
  get<T>(key: string): Promise<T | null>;
  getdel<T>(key: string): Promise<T | null>;
}

export interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  epoch: number;
}

export interface RefreshTokenRecord {
  clientId: string;
  scope: string;
  resource: string;
  epoch: number;
  /** Every rotation of one sign-in shares a family, so a replayed token can revoke all of them. */
  familyId: string;
}

export type RefreshConsumption =
  | { status: "ok"; record: RefreshTokenRecord }
  | { status: "reused" }
  | { status: "invalid" };

const PREFIX = "mcp-oauth";
const codeKey = (code: string) => `${PREFIX}:code:${digestToken(code)}`;
const refreshKey = (token: string) => `${PREFIX}:rt:${digestToken(token)}`;
const usedRefreshKey = (token: string) => `${PREFIX}:rt-used:${digestToken(token)}`;
const revokedFamilyKey = (familyId: string) => `${PREFIX}:family-revoked:${familyId}`;

let defaultKv: OAuthKv | null = null;

export function getOAuthKv(): OAuthKv {
  if (defaultKv) return defaultKv;
  const credentials = getUpstashCredentials();
  if (!credentials) throw new OAuthConfigError("Redis (Upstash) non configuré.");
  defaultKv = new Redis({ url: credentials.url, token: credentials.token });
  return defaultKv;
}

export async function saveAuthorizationCode(
  kv: OAuthKv,
  record: AuthorizationCodeRecord
): Promise<string> {
  const code = generateOpaqueToken();
  await kv.set(codeKey(code), record, { ex: AUTHORIZATION_CODE_TTL_SECONDS });
  return code;
}

export async function consumeAuthorizationCode(
  kv: OAuthKv,
  code: string
): Promise<AuthorizationCodeRecord | null> {
  return kv.getdel<AuthorizationCodeRecord>(codeKey(code));
}

export async function issueRefreshToken(kv: OAuthKv, record: RefreshTokenRecord): Promise<string> {
  const token = generateOpaqueToken();
  await kv.set(refreshKey(token), record, { ex: REFRESH_TOKEN_TTL_SECONDS });
  return token;
}

export async function consumeRefreshToken(kv: OAuthKv, token: string): Promise<RefreshConsumption> {
  const record = await kv.getdel<RefreshTokenRecord>(refreshKey(token));
  if (record) {
    if (await kv.get<number>(revokedFamilyKey(record.familyId))) return { status: "invalid" };
    await kv.set(
      usedRefreshKey(token),
      { familyId: record.familyId },
      { ex: REFRESH_TOKEN_TTL_SECONDS }
    );
    return { status: "ok", record };
  }
  // A rotated token presented again means two parties hold the family: revoke all of it.
  const used = await kv.get<{ familyId: string }>(usedRefreshKey(token));
  if (used?.familyId) {
    await kv.set(revokedFamilyKey(used.familyId), 1, { ex: REFRESH_TOKEN_TTL_SECONDS });
    return { status: "reused" };
  }
  return { status: "invalid" };
}
