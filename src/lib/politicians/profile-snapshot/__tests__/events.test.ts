import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultSend,
  PROFILE_RECONCILE_ACTIVE_EVENT,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
  requestActiveProfileReconcile,
  requestProfileReconcile,
} from "../events";

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

describe("requestActiveProfileReconcile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envoie son propre événement, jamais celui du rattrapage complet", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await requestActiveProfileReconcile("sync-scrutins", send)).toEqual({ sent: 1 });
    expect(send).toHaveBeenCalledExactlyOnceWith([
      { name: PROFILE_RECONCILE_ACTIVE_EVENT, data: { reason: "sync-scrutins" } },
    ]);
    expect(PROFILE_RECONCILE_ACTIVE_EVENT).not.toBe(PROFILE_RECONCILE_EVENT);
  });

  it("ne lève pas quand l'envoi échoue", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue(new Error("no event key"));
    await expect(requestActiveProfileReconcile("cron:votes", send)).resolves.toEqual({ sent: 0 });
  });
});

describe("defaultSend sans clé Inngest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passe par la route de l'application, un appel par corps", async () => {
    vi.stubEnv("INNGEST_EVENT_KEY", "");
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://example.test");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await defaultSend([
      { name: PROFILE_REFRESH_EVENT, data: { politicianId: "a", reason: "sync:photos" } },
      { name: PROFILE_REFRESH_EVENT, data: { politicianId: "b", reason: "sync:photos" } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.test/api/cron/revalidate");
    expect(JSON.parse(init.body)).toEqual({
      profileRefresh: { politicianIds: ["a", "b"], reason: "sync:photos" },
    });
  });
});
