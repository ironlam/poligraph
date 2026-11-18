import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ politicians: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { politician: { findMany: h.politicians } } }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh: h.refresh }));

import {
  listParrainagesPresenterIds,
  listParrainagesRecipientIds,
  refreshParrainagesFiches,
} from "../parrainages-fiches";

const SLUG = "presidentielle-2022";
const ids = (...values: string[]) => values.map((id) => ({ id }));
type Where = { slug?: unknown; candidacies?: unknown; parrainages?: unknown };
const whereOf = (call: unknown[]) => (call[0] as { where: Where }).where;

beforeEach(() => {
  vi.clearAllMocks();
  h.refresh.mockResolvedValue({ sent: 3, mode: "targeted" });
  // One answer per kind of query, whatever the order they are sent in.
  h.politicians.mockImplementation(async ({ where }: { where: Where }) =>
    where.slug
      ? ids("p-taubira")
      : where.candidacies
        ? ids("p-pecresse")
        : ids("p-maire", "p-pecresse")
  );
});

describe("fiches concernées par les parrainages", () => {
  it("retient les candidats reliés par leur candidature ou par la table validée, publiés seulement", async () => {
    expect(await listParrainagesRecipientIds(SLUG)).toEqual(["p-pecresse", "p-taubira"]);
    const wheres = h.politicians.mock.calls.map(whereOf);
    expect(
      wheres.every(
        (where) => (where as { publicationStatus?: string }).publicationStatus === "PUBLISHED"
      )
    ).toBe(true);
    expect(wheres.find((where) => where.candidacies)?.candidacies).toEqual({
      some: { election: { slug: SLUG }, parrainages: { some: {} } },
    });
    const slugs = (wheres.find((where) => where.slug)?.slug as { in: string[] }).in;
    expect(slugs).toContain("christiane-taubira");
    expect(slugs).toHaveLength(17);
  });

  it("ne cherche pas dans la table validée pour une élection qui n'en a pas", async () => {
    expect(await listParrainagesRecipientIds("presidentielle-2027")).toEqual(["p-pecresse"]);
    expect(h.politicians).toHaveBeenCalledTimes(1);
  });

  it("retient les élus publiés reliés à une présentation de l'élection", async () => {
    expect(await listParrainagesPresenterIds(SLUG)).toEqual(["p-maire", "p-pecresse"]);
    expect(whereOf(h.politicians.mock.calls[0]!)).toEqual({
      publicationStatus: "PUBLISHED",
      parrainages: { some: { election: { slug: SLUG } } },
    });
  });
});

describe("refreshParrainagesFiches", () => {
  it("compte sans rien envoyer en aperçu", async () => {
    expect(await refreshParrainagesFiches(SLUG, { write: false })).toEqual({
      electionSlug: SLUG,
      presenters: 2,
      recipients: 2,
      total: 3,
      mode: null,
    });
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("demande le recalcul de chaque fiche une seule fois", async () => {
    const report = await refreshParrainagesFiches(SLUG, { write: true });
    expect(report.mode).toBe("targeted");
    expect(h.refresh).toHaveBeenCalledTimes(1);
    const [target, reason] = h.refresh.mock.calls[0]!;
    expect([...(target as { politicianIds: string[] }).politicianIds].sort()).toEqual([
      "p-maire",
      "p-pecresse",
      "p-taubira",
    ]);
    expect(reason).toBe("sync:parrainages-fiches");
  });

  it("n'envoie rien quand aucune fiche n'est concernée", async () => {
    h.politicians.mockResolvedValue([]);
    const report = await refreshParrainagesFiches(SLUG, { write: true });
    expect(report).toMatchObject({ total: 0, mode: null });
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
