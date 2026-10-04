import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// IMPORTANT 3: before this test, the script closed the loop on the DB write
// (Affair -> DRAFT, AuditLog row) but never told the CDN. The 24h-cached CSV
// exports kept serving the depublished affair, which is exactly what the RGPD
// article 10 remediation exists to prevent. The purge must fire once a
// depublication actually happened, and must never throw (a cache outage must
// not turn a data-remediation run into a crash).

const h = vi.hoisted(() => ({
  db: {
    affair: { findMany: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $disconnect: vi.fn(),
  },
  checkPublishable: vi.fn(),
  revalidateRemoteCache: vi.fn(),
  requestProfileRefresh: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({ db: h.db }));
vi.mock("../../src/lib/affairs/publish-guard", () => ({
  checkPublishable: h.checkPublishable,
}));
vi.mock("../lib/revalidate-cache", () => ({
  revalidateRemoteCache: h.revalidateRemoteCache,
}));
vi.mock("../../src/lib/politicians/profile-snapshot/request", () => ({
  requestProfileRefresh: h.requestProfileRefresh,
}));

const UNVERIFIED_AFFAIR = {
  id: "aff-1",
  slug: "aff-1-slug",
  title: "Affaire non validée",
  status: "MIS_EN_EXAMEN",
  verifiedAt: null,
  verifiedBy: null,
  sources: [{ sourceType: "PRESS" }],
};

describe("scripts/remediate-unverified-published-affairs", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalArgv: string[];

  beforeEach(() => {
    h.db.affair.findMany.mockReset();
    h.db.affair.update.mockReset().mockResolvedValue(undefined);
    h.db.auditLog.create.mockReset().mockResolvedValue(undefined);
    h.db.$disconnect.mockReset().mockResolvedValue(undefined);
    h.checkPublishable.mockReset().mockResolvedValue([]);
    h.revalidateRemoteCache.mockReset().mockResolvedValue(undefined);
    h.requestProfileRefresh.mockReset().mockResolvedValue({ sent: 0, mode: "targeted" });
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalArgv = process.argv;
    process.argv = ["node", "remediate-unverified-published-affairs.ts"];
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.argv = originalArgv;
    vi.resetModules();
  });

  it("does not purge the cache on a dry run, since nothing was actually written", async () => {
    h.db.affair.findMany.mockResolvedValue([UNVERIFIED_AFFAIR]);
    const { main } = await import("../remediate-unverified-published-affairs");

    await main();

    expect(h.db.affair.update).not.toHaveBeenCalled();
    expect(h.revalidateRemoteCache).not.toHaveBeenCalled();
  });

  it("purges the affairs and politicians export tags once real affairs were depublished", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([UNVERIFIED_AFFAIR]);
    const { main } = await import("../remediate-unverified-published-affairs");

    await main();

    expect(h.db.affair.update).toHaveBeenCalledTimes(1);
    expect(h.revalidateRemoteCache).toHaveBeenCalledWith(["affairs", "politicians"]);
    expect(h.revalidateRemoteCache).toHaveBeenCalledTimes(1);
  });

  it("does not purge when no affair qualified, even with --confirm", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([]);
    const { main } = await import("../remediate-unverified-published-affairs");

    await main();

    expect(h.revalidateRemoteCache).not.toHaveBeenCalled();
  });

  it("stays loud but does not throw when the purge fails, so the remediation run itself succeeds", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([UNVERIFIED_AFFAIR]);
    h.revalidateRemoteCache.mockRejectedValueOnce(new Error("CRON_SECRET manquant"));
    const { main } = await import("../remediate-unverified-published-affairs");

    await expect(main()).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("ATTENTION"),
      expect.any(Error)
    );
  });

  it("still requests the profile refresh and the purge for affairs depublished before a crash, then rethrows", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([
      UNVERIFIED_AFFAIR,
      { ...UNVERIFIED_AFFAIR, id: "aff-2", slug: "aff-2-slug" },
      { ...UNVERIFIED_AFFAIR, id: "aff-3", slug: "aff-3-slug" },
    ]);
    h.db.affair.update
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("connexion perdue"));
    const { main } = await import("../remediate-unverified-published-affairs");

    await expect(main()).rejects.toThrow("connexion perdue");

    // Only aff-1 reached DRAFT: aff-2 failed, aff-3 was never attempted.
    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { affairIds: ["aff-1"] },
      "cli:remediate-unverified-published-affairs"
    );
    expect(h.revalidateRemoteCache).toHaveBeenCalledExactlyOnceWith(["affairs", "politicians"]);
  });

  it("requests the profile refresh for every depublished affair on a full run", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([
      UNVERIFIED_AFFAIR,
      { ...UNVERIFIED_AFFAIR, id: "aff-2", slug: "aff-2-slug" },
    ]);
    const { main } = await import("../remediate-unverified-published-affairs");

    await main();

    expect(h.requestProfileRefresh).toHaveBeenCalledExactlyOnceWith(
      { affairIds: ["aff-1", "aff-2"] },
      "cli:remediate-unverified-published-affairs"
    );
  });

  it("requests nothing when the very first update fails", async () => {
    process.argv.push("--confirm");
    h.db.affair.findMany.mockResolvedValue([UNVERIFIED_AFFAIR]);
    h.db.affair.update.mockRejectedValueOnce(new Error("connexion perdue"));
    const { main } = await import("../remediate-unverified-published-affairs");

    await expect(main()).rejects.toThrow("connexion perdue");

    expect(h.requestProfileRefresh).not.toHaveBeenCalled();
    expect(h.revalidateRemoteCache).not.toHaveBeenCalled();
  });
});
