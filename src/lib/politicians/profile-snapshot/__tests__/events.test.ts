import { afterEach, describe, expect, it, vi } from "vitest";

import { PROFILE_RECONCILE_EVENT, requestProfileReconcile } from "../events";

describe("requestProfileReconcile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envoie un seul rattrapage avec sa raison", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await requestProfileReconcile("cron:politicians", send)).toEqual({ sent: 1 });
    expect(send).toHaveBeenCalledWith([
      { name: PROFILE_RECONCILE_EVENT, data: { reason: "cron:politicians" } },
    ]);
  });

  it("ne lève pas quand l'envoi échoue et journalise", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("no event key"));
    await expect(requestProfileReconcile("cron:votes", send)).resolves.toEqual({ sent: 0 });
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({
      event: "[profile-snapshot] reconcile request failed",
      reason: "cron:votes",
      error: "no event key",
    });
  });
});
