import { beforeEach, describe, expect, it, vi } from "vitest";
import { XRPCError } from "@atproto/xrpc";
import { ApiResponseError } from "twitter-api-v2";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
  auditCreate: vi.fn(),
  publishToBluesky: vi.fn(),
  publishToX: vi.fn(),
  checkBlueskyAccount: vi.fn(),
  checkXAccount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialPost: { findUnique: mocks.findUnique, update: mocks.update, count: mocks.count },
    auditLog: { create: mocks.auditCreate },
  },
}));

vi.mock("@/lib/api/social-networks", () => ({
  publishToBluesky: mocks.publishToBluesky,
  publishToX: mocks.publishToX,
  checkBlueskyAccount: mocks.checkBlueskyAccount,
  checkXAccount: mocks.checkXAccount,
}));

import { checkSocialAccounts, publishSocialPost, startOfParisDay } from "../publish";

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    category: "votes",
    status: "PENDING_REVIEW",
    content: "Texte Bluesky avec poligraph.fr",
    twitterContent: "Texte X sans lien",
    blueskyUrl: null,
    twitterUrl: null,
    postedAt: null,
    error: null,
    ...overrides,
  };
}

const xUnauthorized = () =>
  new ApiResponseError("Request failed with code 401", {
    code: 401,
    data: { title: "Unauthorized" } as never,
    headers: {},
    request: {} as never,
    response: {} as never,
  });

describe("publishSocialPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.count.mockResolvedValue(0);
    mocks.update.mockResolvedValue({});
    mocks.auditCreate.mockResolvedValue({});
    mocks.publishToBluesky.mockResolvedValue({ url: "https://bsky.app/profile/p/post/1" });
    mocks.publishToX.mockResolvedValue({ url: "https://x.com/poligraph_fr/status/1" });
  });

  it("publishes on both networks and marks the post POSTED", async () => {
    mocks.findUnique.mockResolvedValue(post());
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    expect(outcome.ok && outcome.complet).toBe(true);
    expect(mocks.update.mock.calls[0]![0].data.status).toBe("POSTED");
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });

  it("keeps the Bluesky success when X fails, with a diagnostic, and stays retryable", async () => {
    mocks.findUnique.mockResolvedValue(post());
    mocks.publishToX.mockRejectedValue(xUnauthorized());
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    if (!outcome.ok) throw new Error("expected a result");
    const x = outcome.resultats.find((entry) => entry.reseau === "x");
    expect(x?.statut).toBe("echec");
    expect(x && x.statut === "echec" && x.diagnostic.code).toBe("INVALID_CREDENTIALS");
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.blueskyUrl).toBe("https://bsky.app/profile/p/post/1");
    expect(data.status).toBe("PENDING_REVIEW");
    expect(JSON.parse(data.error)[0].code).toBe("INVALID_CREDENTIALS");
  });

  it("skips a network already published", async () => {
    mocks.findUnique.mockResolvedValue(post({ blueskyUrl: "https://bsky.app/old" }));
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    expect(mocks.publishToBluesky).not.toHaveBeenCalled();
    expect(outcome.ok && outcome.complet).toBe(true);
  });

  it("refuses an affaire that was not approved in the admin", async () => {
    mocks.findUnique.mockResolvedValue(post({ category: "affaires" }));
    const outcome = await publishSocialPost("post-1", ["bluesky"], { actor: "mcp:test" });
    expect(outcome.ok).toBe(false);
    expect(mocks.publishToBluesky).not.toHaveBeenCalled();
  });

  it("publishes an affaire once approved", async () => {
    mocks.findUnique.mockResolvedValue(post({ category: "affaires", status: "APPROVED" }));
    const outcome = await publishSocialPost("post-1", ["bluesky"], { actor: "mcp:test" });
    expect(outcome.ok).toBe(true);
    expect(mocks.publishToBluesky).toHaveBeenCalledOnce();
  });

  it("honours the kill switch and the daily cap", async () => {
    mocks.findUnique.mockResolvedValue(post());
    vi.stubEnv("SOCIAL_AUTO_POST", "false");
    expect((await publishSocialPost("post-1", ["x"], { actor: "mcp:test" })).ok).toBe(false);

    vi.stubEnv("SOCIAL_AUTO_POST", "true");
    vi.stubEnv("SOCIAL_DAILY_CAP", "2");
    mocks.count.mockResolvedValue(2);
    const capped = await publishSocialPost("post-1", ["x"], { actor: "mcp:test" });
    expect(capped.ok && capped.resultats[0]!.statut).toBe("ignore");
    expect(mocks.publishToX).not.toHaveBeenCalled();
  });

  it("refuses a link on X before calling the API", async () => {
    mocks.findUnique.mockResolvedValue(post({ twitterContent: "Lire sur poligraph.fr" }));
    const outcome = await publishSocialPost("post-1", ["x"], { actor: "mcp:test" });
    expect(outcome.ok && outcome.resultats[0]!.statut).toBe("echec");
    expect(mocks.publishToX).not.toHaveBeenCalled();
  });
});

describe("checkSocialAccounts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports a read-only X token even when the keys authenticate", async () => {
    mocks.checkBlueskyAccount.mockResolvedValue({ handle: "poligraph-fr.bsky.social" });
    mocks.checkXAccount.mockResolvedValue({ handle: "poligraph_fr", accessLevel: "read" });
    const [bluesky, x] = await checkSocialAccounts();
    expect(bluesky).toMatchObject({ reseau: "bluesky", ok: true });
    expect(x).toMatchObject({ reseau: "x", ok: false });
    expect(x!.ok === false && x!.diagnostic.code).toBe("INSUFFICIENT_PERMISSIONS");
  });

  it("diagnoses a revoked Bluesky app password", async () => {
    mocks.checkBlueskyAccount.mockRejectedValue(
      new XRPCError(401, "AuthenticationRequired", "Invalid identifier or password")
    );
    mocks.checkXAccount.mockResolvedValue({ handle: "poligraph_fr", accessLevel: "read-write" });
    const [bluesky, x] = await checkSocialAccounts();
    expect(bluesky!.ok === false && bluesky!.diagnostic.code).toBe("INVALID_CREDENTIALS");
    expect(x).toMatchObject({ ok: true, compte: "@poligraph_fr" });
  });
});

describe("startOfParisDay", () => {
  it("returns midnight in Paris, winter and summer", () => {
    expect(startOfParisDay(new Date("2026-11-22T19:00:00Z")).toISOString()).toBe(
      "2026-11-21T23:00:00.000Z"
    );
    expect(startOfParisDay(new Date("2026-07-14T21:30:00Z")).toISOString()).toBe(
      "2026-07-13T22:00:00.000Z"
    );
  });
});
