import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRaw, build } = vi.hoisted(() => ({ queryRaw: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: queryRaw } }));
vi.mock("../build", () => ({ buildPoliticianProfileDocument: build }));

import { refreshPoliticianProfile } from "../refresh";
import { hashSerializedDocument, serializeProfileDocument } from "../document";
import type { PoliticianProfileDocument } from "../document";

const doc = {
  identity: { id: "pol-1", slug: "slug-courant" },
  dossier: {},
  voteStats: null,
  mandateType: null,
} as unknown as PoliticianProfileDocument;
const hash = hashSerializedDocument(serializeProfileDocument(doc));

describe("refreshPoliticianProfile", () => {
  const revalidate = vi.fn();

  beforeEach(() => {
    queryRaw.mockReset();
    build.mockReset();
    revalidate.mockReset();
    build.mockResolvedValue(doc);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("invalide la fiche du slug courant quand le contenu change", async () => {
    queryRaw.mockResolvedValue([{ prev_hash: "ancienne", written: 1 }]);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome).toMatchObject({ politicianId: "pol-1", status: "updated", reason: "test" });
    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(revalidate).toHaveBeenCalledWith("politician:slug-courant");
  });

  it("invalide aussi à la première écriture", async () => {
    queryRaw.mockResolvedValue([{ prev_hash: null, written: 1 }]);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("updated");
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("n'invalide pas quand le contenu est inchangé", async () => {
    queryRaw.mockResolvedValue([{ prev_hash: hash, written: 1 }]);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("unchanged");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("n'invalide pas quand l'écriture est rejetée comme plus ancienne", async () => {
    queryRaw.mockResolvedValue([{ prev_hash: "plus-récente", written: 0 }]);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("skipped-stale");
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("n'écrit ni n'invalide une fiche non publique", async () => {
    build.mockResolvedValue(null);
    const outcome = await refreshPoliticianProfile("pol-1", "test", { revalidate });
    expect(outcome.status).toBe("not-public");
    expect(queryRaw).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("journalise une ligne JSON par recalcul", async () => {
    queryRaw.mockResolvedValue([{ prev_hash: hash, written: 1 }]);
    await refreshPoliticianProfile("pol-1", "test", { revalidate });
    const line = vi.mocked(console.info).mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({
      event: "[profile-snapshot] refresh",
      politicianId: "pol-1",
      status: "unchanged",
      reason: "test",
    });
  });
});
