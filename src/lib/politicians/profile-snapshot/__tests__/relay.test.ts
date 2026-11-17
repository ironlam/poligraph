import { describe, expect, it, vi } from "vitest";

import {
  PROFILE_RECONCILE_ACTIVE_EVENT,
  PROFILE_RECONCILE_EVENT,
  PROFILE_REFRESH_EVENT,
} from "../events";
import { relayProfileEvents, resolveProfileRelayTarget, toProfileRelayBodies } from "../relay";

const WORKFLOW_ENV = { CRON_SECRET: "secret", NEXT_PUBLIC_BASE_URL: "https://example.test/" };

describe("resolveProfileRelayTarget", () => {
  it("relaie depuis un workflow : secret et adresse du site, pas de clé Inngest", () => {
    expect(resolveProfileRelayTarget(WORKFLOW_ENV)).toEqual({
      endpoint: "https://example.test/api/cron/revalidate",
      secret: "secret",
    });
  });

  it("ne relaie pas quand la clé Inngest est là", () => {
    expect(resolveProfileRelayTarget({ ...WORKFLOW_ENV, INNGEST_EVENT_KEY: "key" })).toBeNull();
  });

  it("ne relaie pas sans secret ou sans adresse", () => {
    expect(resolveProfileRelayTarget({ CRON_SECRET: "secret" })).toBeNull();
    expect(resolveProfileRelayTarget({ NEXT_PUBLIC_BASE_URL: "https://example.test" })).toBeNull();
  });
});

describe("toProfileRelayBodies", () => {
  it("regroupe les rafraîchissements d'une même raison", () => {
    const events = ["a", "b"].map((politicianId) => ({
      name: PROFILE_REFRESH_EVENT,
      data: { politicianId, reason: "sync:photos" },
    }));
    expect(toProfileRelayBodies(events)).toEqual([
      { profileRefresh: { politicianIds: ["a", "b"], reason: "sync:photos" } },
    ]);
  });

  it("distingue le rattrapage complet du rattrapage des profils actifs", () => {
    expect(
      toProfileRelayBodies([
        { name: PROFILE_RECONCILE_EVENT, data: { reason: "x" } },
        { name: PROFILE_RECONCILE_ACTIVE_EVENT, data: { reason: "y" } },
      ])
    ).toEqual([
      { profileReconcile: { reason: "x", active: false } },
      { profileReconcile: { reason: "y", active: true } },
    ]);
  });

  it("refuse un événement que la route n'accepte pas", () => {
    expect(() => toProfileRelayBodies([{ name: "autre/chose", data: {} }])).toThrow(
      "cannot be relayed"
    );
  });
});

describe("relayProfileEvents", () => {
  const target = { endpoint: "https://example.test/api/cron/revalidate", secret: "secret" };
  const events = [{ name: PROFILE_REFRESH_EVENT, data: { politicianId: "a", reason: "r" } }];

  it("poste le corps avec le secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await relayProfileEvents(events, target, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(target.endpoint);
    expect(init.headers.Authorization).toBe("Bearer secret");
    expect(JSON.parse(init.body)).toEqual({
      profileRefresh: { politicianIds: ["a"], reason: "r" },
    });
  });

  it("lève quand la route refuse, pour que l'appelant le journalise", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    await expect(
      relayProfileEvents(events, target, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow("HTTP 502");
  });
});
