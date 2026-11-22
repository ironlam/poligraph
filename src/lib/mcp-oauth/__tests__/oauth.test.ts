import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResourceUrl } from "../config";
import { isRegisteredRedirect, parseClientIdUrl, parseClientMetadata } from "../client";
import {
  approveAuthorization,
  denyAuthorization,
  validateAuthorizationRequest,
  type AuthorizationParams,
} from "../authorize";
import type { OAuthKv } from "../store";
import { handleTokenRequest } from "../token-endpoint";
import { signAccessToken, verifyAccessToken, verifyPkce } from "../tokens";

const SECRET = "s".repeat(40);
const CLIENT_ID = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(64);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

class MemoryKv implements OAuthKv {
  readonly data = new Map<string, unknown>();
  async set(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
    return "OK";
  }
  async get<T>(key: string) {
    return (this.data.get(key) as T | undefined) ?? null;
  }
  async getdel<T>(key: string) {
    const value = (this.data.get(key) as T | undefined) ?? null;
    this.data.delete(key);
    return value;
  }
}

const clientDocument = {
  client_id: CLIENT_ID,
  client_name: "Claude",
  redirect_uris: [REDIRECT],
  token_endpoint_auth_method: "none",
};

const fetchMetadata = async (clientId: string) => {
  const metadata = parseClientMetadata(clientDocument, clientId);
  return metadata ? { ok: true as const, metadata } : { ok: false as const, reason: "invalide" };
};

function authorizationParams(overrides: Partial<AuthorizationParams> = {}): AuthorizationParams {
  return {
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    state: "etat-123",
    scope: "social offline_access",
    resource: getResourceUrl(),
    ...overrides,
  };
}

function form(values: Record<string, string>) {
  return new URLSearchParams(values);
}

beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", SECRET);
  vi.stubEnv("MCP_OAUTH_EPOCH", "0");
});

afterEach(() => vi.unstubAllEnvs());

describe("access tokens", () => {
  const expected = { secret: SECRET, issuer: "https://poligraph.fr", audience: "aud", epoch: 0 };
  const claims = {
    iss: "https://poligraph.fr",
    aud: "aud",
    sub: "admin",
    clientId: CLIENT_ID,
    scope: "social",
    epoch: 0,
    iat: 1_000,
    exp: 2_000,
  };

  it("round-trips while valid", () => {
    const token = signAccessToken(claims, SECRET);
    expect(verifyAccessToken(token, { ...expected, now: 1_500_000 })?.clientId).toBe(CLIENT_ID);
  });

  it("rejects expiry, another audience, another epoch and a forged signature", () => {
    const token = signAccessToken(claims, SECRET);
    expect(verifyAccessToken(token, { ...expected, now: 2_000_000 })).toBeNull();
    expect(verifyAccessToken(token, { ...expected, audience: "x", now: 1_500_000 })).toBeNull();
    expect(verifyAccessToken(token, { ...expected, epoch: 1, now: 1_500_000 })).toBeNull();
    expect(verifyAccessToken(signAccessToken(claims, "t".repeat(40)), expected)).toBeNull();
  });
});

describe("PKCE", () => {
  it("accepts the matching verifier only", () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
    expect(verifyPkce("w".repeat(64), CHALLENGE)).toBe(false);
    expect(verifyPkce("short", CHALLENGE)).toBe(false);
  });
});

describe("client identification", () => {
  it("only accepts HTTPS client_id URLs on allowed hosts", () => {
    expect(parseClientIdUrl(CLIENT_ID, ["claude.ai"])).not.toBeNull();
    expect(parseClientIdUrl("http://claude.ai/x", ["claude.ai"])).toBeNull();
    expect(parseClientIdUrl("https://evil.example/x", ["claude.ai"])).toBeNull();
    expect(parseClientIdUrl("https://claude.ai.evil.example/x", ["claude.ai"])).toBeNull();
    expect(parseClientIdUrl("https://claude.ai:8443/x", ["claude.ai"])).toBeNull();
    expect(parseClientIdUrl("https://claude.ai/", ["claude.ai"])).toBeNull();
  });

  it("requires the document to name its own URL", () => {
    expect(parseClientMetadata({ ...clientDocument, client_id: "https://other" }, CLIENT_ID)).toBe(
      null
    );
  });

  it("matches loopback redirects without the port, everything else exactly", () => {
    const registered = ["http://localhost/callback", "http://127.0.0.1/callback", REDIRECT];
    expect(isRegisteredRedirect("http://localhost:3118/callback", registered)).toBe(true);
    expect(isRegisteredRedirect("http://127.0.0.1:52000/callback", registered)).toBe(true);
    expect(isRegisteredRedirect("http://localhost:3118/autre", registered)).toBe(false);
    expect(isRegisteredRedirect(`${REDIRECT}?x=1`, registered)).toBe(false);
    expect(isRegisteredRedirect("https://claude.ai:444/api/mcp/auth_callback", registered)).toBe(
      false
    );
  });
});

describe("authorization request", () => {
  it("validates a well-formed Claude request", async () => {
    const result = await validateAuthorizationRequest(authorizationParams(), fetchMetadata);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.clientHost).toBe("claude.ai");
      expect(result.request.scope).toBe("social offline_access");
    }
  });

  it("refuses missing PKCE, a foreign resource and an unregistered redirect", async () => {
    const noPkce = await validateAuthorizationRequest(
      authorizationParams({ code_challenge_method: "plain" }),
      fetchMetadata
    );
    expect(noPkce.ok).toBe(false);
    const foreign = await validateAuthorizationRequest(
      authorizationParams({ resource: "https://autre.example/mcp" }),
      fetchMetadata
    );
    expect(foreign.ok).toBe(false);
    const redirect = await validateAuthorizationRequest(
      authorizationParams({ redirect_uri: "https://evil.example/cb" }),
      fetchMetadata
    );
    expect(redirect.ok).toBe(false);
  });

  it("returns state and issuer with the code, and access_denied on refusal", async () => {
    const result = await validateAuthorizationRequest(authorizationParams(), fetchMetadata);
    if (!result.ok) throw new Error("expected a valid request");
    const approved = new URL(await approveAuthorization(new MemoryKv(), result.request));
    expect(approved.searchParams.get("code")).toBeTruthy();
    expect(approved.searchParams.get("state")).toBe("etat-123");
    expect(approved.searchParams.get("iss")).toBe("https://poligraph.fr");
    const denied = new URL(denyAuthorization(result.request));
    expect(denied.searchParams.get("error")).toBe("access_denied");
  });
});

describe("token endpoint", () => {
  async function codeFor(kv: MemoryKv) {
    const result = await validateAuthorizationRequest(authorizationParams(), fetchMetadata);
    if (!result.ok) throw new Error("expected a valid request");
    return new URL(await approveAuthorization(kv, result.request)).searchParams.get("code")!;
  }

  function exchange(kv: MemoryKv, code: string, verifier = VERIFIER) {
    return handleTokenRequest(
      form({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: REDIRECT,
        client_id: CLIENT_ID,
        resource: getResourceUrl(),
      }),
      { kv }
    );
  }

  it("exchanges a code once, with the right verifier", async () => {
    const kv = new MemoryKv();
    const code = await codeFor(kv);
    const first = await exchange(kv, code);
    expect(first.status).toBe(200);
    expect(first.body.token_type).toBe("Bearer");
    expect(typeof first.body.refresh_token).toBe("string");
    const replay = await exchange(kv, code);
    expect(replay.body.error).toBe("invalid_grant");
  });

  it("burns the code on a wrong verifier", async () => {
    const kv = new MemoryKv();
    const code = await codeFor(kv);
    expect((await exchange(kv, code, "w".repeat(64))).body.error).toBe("invalid_grant");
    expect((await exchange(kv, code)).body.error).toBe("invalid_grant");
  });

  it("issues tokens the MCP endpoint accepts", async () => {
    const kv = new MemoryKv();
    const response = await exchange(kv, await codeFor(kv));
    const claims = verifyAccessToken(String(response.body.access_token), {
      secret: SECRET,
      issuer: "https://poligraph.fr",
      audience: getResourceUrl(),
      epoch: 0,
    });
    expect(claims?.sub).toBe("admin");
  });

  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const kv = new MemoryKv();
    const initial = await exchange(kv, await codeFor(kv));
    const refresh = (token: string) =>
      handleTokenRequest(
        form({ grant_type: "refresh_token", refresh_token: token, client_id: CLIENT_ID }),
        { kv }
      );

    const rotated = await refresh(String(initial.body.refresh_token));
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(initial.body.refresh_token);

    // The old token comes back: someone else holds it, so the live one dies too.
    expect((await refresh(String(initial.body.refresh_token))).body.error).toBe("invalid_grant");
    expect((await refresh(String(rotated.body.refresh_token))).body.error).toBe("invalid_grant");
  });

  it("invalidates refresh tokens when the epoch moves", async () => {
    const kv = new MemoryKv();
    const initial = await exchange(kv, await codeFor(kv));
    vi.stubEnv("MCP_OAUTH_EPOCH", "1");
    const response = await handleTokenRequest(
      form({
        grant_type: "refresh_token",
        refresh_token: String(initial.body.refresh_token),
        client_id: CLIENT_ID,
      }),
      { kv }
    );
    expect(response.body.error).toBe("invalid_grant");
  });

  it("rejects unknown grants and foreign resources", async () => {
    const kv = new MemoryKv();
    expect(
      (await handleTokenRequest(form({ grant_type: "password", client_id: CLIENT_ID }), { kv }))
        .body.error
    ).toBe("unsupported_grant_type");
    expect(
      (
        await handleTokenRequest(
          form({ grant_type: "refresh_token", client_id: CLIENT_ID, resource: "https://x/y" }),
          { kv }
        )
      ).body.error
    ).toBe("invalid_target");
  });
});
