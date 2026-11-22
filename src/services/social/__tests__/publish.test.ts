import { beforeEach, describe, expect, it, vi } from "vitest";
import { XRPCError } from "@atproto/xrpc";
import { ApiResponseError } from "twitter-api-v2";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  count: vi.fn(),
  auditCreate: vi.fn(),
  publishToBluesky: vi.fn(),
  publishToX: vi.fn(),
  checkBlueskyAccount: vi.fn(),
  checkXAccount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    socialPost: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      updateMany: mocks.updateMany,
      count: mocks.count,
    },
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
    blueskyPostedAt: null,
    twitterPostedAt: null,
    blueskyError: null,
    twitterError: null,
    postedAt: null,
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

/**
 * A tiny stand-in for the SocialPost row: the claim, the per-network saves and the final read all
 * go through it, so the tests see what the service actually persisted.
 */
function useRow(initial: ReturnType<typeof post>) {
  const row = { ...initial } as Record<string, unknown>;
  mocks.findUnique.mockImplementation(async () => ({ ...row }));
  mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    Object.assign(row, data);
    return { ...row };
  });
  mocks.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const urlField = "blueskyUrl" in where ? "blueskyUrl" : "twitterUrl";
      if ("postedAt" in where) {
        if (row.postedAt !== null) return { count: 0 };
      } else {
        const claimField = urlField === "blueskyUrl" ? "blueskyPostedAt" : "twitterPostedAt";
        const claimFree = (where.OR as Record<string, unknown>[]).some((condition) => {
          const value = condition[claimField];
          if (value === null) return row[claimField] === null;
          const before = (value as { lt: Date }).lt;
          return row[claimField] instanceof Date && (row[claimField] as Date) < before;
        });
        if (row[urlField] !== null || !claimFree) return { count: 0 };
      }
      Object.assign(row, data);
      return { count: 1 };
    }
  );
  return row;
}

describe("publishSocialPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.count.mockResolvedValue(0);
    mocks.auditCreate.mockResolvedValue({});
    mocks.publishToBluesky.mockResolvedValue({ url: "https://bsky.app/profile/p/post/1" });
    mocks.publishToX.mockResolvedValue({ url: "https://x.com/poligraph_fr/status/1" });
  });

  it("publishes on both networks and marks the post POSTED", async () => {
    const row = useRow(post());
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    expect(outcome.ok && outcome.complet).toBe(true);
    expect(row.status).toBe("POSTED");
    expect(row.blueskyPostedAt).toBeInstanceOf(Date);
    expect(row.twitterPostedAt).toBeInstanceOf(Date);
    expect(mocks.auditCreate).toHaveBeenCalledOnce();
  });

  it("keeps the Bluesky success when X fails, releases the X claim and stores its diagnostic", async () => {
    const row = useRow(post());
    mocks.publishToX.mockRejectedValue(xUnauthorized());
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    if (!outcome.ok) throw new Error("expected a result");
    const x = outcome.resultats.find((entry) => entry.reseau === "x");
    expect(x && x.statut === "echec" && x.diagnostic.code).toBe("INVALID_CREDENTIALS");
    expect(row.blueskyUrl).toBe("https://bsky.app/profile/p/post/1");
    expect(row.twitterPostedAt).toBeNull();
    expect(JSON.parse(String(row.twitterError)).code).toBe("INVALID_CREDENTIALS");
    expect(row.status).toBe("PENDING_REVIEW");
  });

  it("never writes the other network's columns", async () => {
    useRow(post({ blueskyUrl: "https://bsky.app/old", blueskyPostedAt: new Date() }));
    await publishSocialPost("post-1", ["x"], { actor: "mcp:test" });
    for (const [{ data }] of mocks.update.mock.calls) {
      expect(data).not.toHaveProperty("blueskyUrl");
      expect(data).not.toHaveProperty("blueskyPostedAt");
    }
  });

  it("skips a network already published", async () => {
    useRow(post({ blueskyUrl: "https://bsky.app/old", blueskyPostedAt: new Date() }));
    const outcome = await publishSocialPost("post-1", ["bluesky", "x"], { actor: "mcp:test" });
    expect(mocks.publishToBluesky).not.toHaveBeenCalled();
    expect(outcome.ok && outcome.complet).toBe(true);
  });

  it("lets only one of two overlapping calls publish a network", async () => {
    useRow(post({ twitterContent: null }));
    const [first, second] = await Promise.all([
      publishSocialPost("post-1", ["bluesky"], { actor: "mcp:a" }),
      publishSocialPost("post-1", ["bluesky"], { actor: "mcp:b" }),
    ]);
    expect(mocks.publishToBluesky).toHaveBeenCalledOnce();
    const statuses = [first, second].map((outcome) => outcome.ok && outcome.resultats[0]!.statut);
    expect(statuses.sort()).toEqual(["ignore", "publie"]);
  });

  it("takes back an interrupted claim only on an explicit resume", async () => {
    const interrupted = new Date(Date.now() - 60 * 60 * 1000);
    useRow(post({ twitterContent: null, blueskyPostedAt: interrupted }));
    const refused = await publishSocialPost("post-1", ["bluesky"], { actor: "mcp:test" });
    expect(refused.ok && refused.resultats[0]).toMatchObject({ statut: "ignore" });
    expect(mocks.publishToBluesky).not.toHaveBeenCalled();

    const resumed = await publishSocialPost("post-1", ["bluesky"], {
      actor: "mcp:test",
      resume: true,
    });
    expect(resumed.ok && resumed.resultats[0]!.statut).toBe("publie");
  });

  it("refuses an affaire that was not approved in the admin", async () => {
    useRow(post({ category: "affaires" }));
    const outcome = await publishSocialPost("post-1", ["bluesky"], { actor: "mcp:test" });
    expect(outcome.ok).toBe(false);
    expect(mocks.publishToBluesky).not.toHaveBeenCalled();
  });

  it("publishes an affaire once approved", async () => {
    useRow(post({ category: "affaires", status: "APPROVED" }));
    const outcome = await publishSocialPost("post-1", ["bluesky"], { actor: "mcp:test" });
    expect(outcome.ok).toBe(true);
    expect(mocks.publishToBluesky).toHaveBeenCalledOnce();
  });

  it("honours the kill switch and counts the cap on the network's own date", async () => {
    useRow(post());
    vi.stubEnv("SOCIAL_AUTO_POST", "false");
    expect((await publishSocialPost("post-1", ["x"], { actor: "mcp:test" })).ok).toBe(false);

    vi.stubEnv("SOCIAL_AUTO_POST", "true");
    vi.stubEnv("SOCIAL_DAILY_CAP", "2");
    mocks.count.mockResolvedValue(2);
    const capped = await publishSocialPost("post-1", ["x"], { actor: "mcp:test" });
    expect(capped.ok && capped.resultats[0]!.statut).toBe("ignore");
    expect(mocks.publishToX).not.toHaveBeenCalled();
    expect(mocks.count.mock.calls.at(-1)![0].where).toHaveProperty("twitterPostedAt");
  });

  it("refuses a link on X before calling the API", async () => {
    useRow(post({ twitterContent: "Lire sur poligraph.fr" }));
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
