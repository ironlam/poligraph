import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { GovernmentEpisode, PersonCard, PublishedGovernment } from "@/lib/governments/mapping";
import { compositionAt, consultableRange } from "@/lib/governments/composition";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/data/government-affairs", () => ({ getGovernmentMemberAffairs: vi.fn() }));
vi.mock("@/lib/data/governments", () => ({
  getPublishedGovernments: vi.fn(),
  getGovernmentEpisodes: vi.fn(),
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import { getGovernmentMemberAffairs } from "@/lib/data/government-affairs";
import { GET as getPersonnes } from "../personnes/route";
import { GET as getFonctions } from "../fonctions/route";
import { GET as getComposition } from "../[slug]/route";

// --- Fixtures ---------------------------------------------------------------

const G: PublishedGovernment = {
  id: "g1",
  slug: "gouvernement-un",
  name: "Gouvernement Un",
  sequence: 1,
  primeMinisterAppointedAt: "2022-05-20",
  formedAt: "2022-05-20",
  resignedAt: "2024-01-08",
  resignedEvidence: "ACT",
  endedAt: "2024-02-01",
  compositionVerifiedAt: "2024-01-08",
  currentAffairsAttested: true,
  hasDerivedDate: false,
  primeMinister: { slug: "p1", fullName: "Alix Premiere", gender: "F" },
  completeness: "COMPLETE",
  pendingChanges: null,
  coverageNote: null,
  compositionVerifiedSourceUrl: null,
  compositionCheckedAt: null,
  referenceSources: { formed: null, resigned: null, ended: null },
  acts: {
    primeMinisterAppointed: null,
    formed: null,
    resigned: null,
    ended: null,
    currentAffairs: null,
  },
  determinations: { primeMinisterAppointed: null, formed: null, resigned: null, ended: null },
  participantCount: 0,
  hiddenCount: 0,
  updatedAt: "2026-10-10T00:00:00.000Z",
};

let seq = 0;
function ep(overrides: Partial<GovernmentEpisode>): GovernmentEpisode {
  seq += 1;
  return {
    membershipId: `ms-${seq}`,
    mandateId: `m-${seq}`,
    mandatePublicId: `MA-${seq}`,
    governmentId: "g1",
    politicianId: "p1",
    type: "MINISTRE",
    title: "Ministre",
    start: "2022-05-20",
    startEvidence: "ACT",
    startSourceUrl: null,
    end: null,
    endEvidence: null,
    endSourceUrl: null,
    endKind: null,
    lastConfirmedAt: null,
    predecessorMembershipId: null,
    sameDayOrderEstablished: false,
    sameDayOrderSourceUrl: null,
    currentAffairsEndedAt: null,
    startActId: null,
    endActId: null,
    currentAffairsEndSourceUrl: null,
    startDetermination: null,
    endDetermination: null,
    currentAffairsEndDetermination: null,
    startAct: null,
    endAct: null,
    currentAffairsEndAct: null,
    ...overrides,
  };
}

function person(
  id: string,
  fullName: string,
  visibility: PersonCard["visibility"],
  publicId: string | null = null
): PersonCard {
  return {
    id,
    publicId,
    slug: id,
    fullName,
    lastName: fullName.split(" ").at(-1)!,
    gender: "M",
    photoUrl: null,
    blobPhotoUrl: null,
    visibility,
  };
}

const act = (label: string, url: string) => ({
  label,
  url,
  signedAt: "2022-05-20",
  effectiveAt: null,
  journalPublishedAt: null,
  journalNumber: null,
  jorfId: null,
});

const people: Record<string, PersonCard> = {
  p1: person("p1", "Alix Premiere", "published", "PG-1"),
  p2: person("p2", "Bob Pending", "pending", "PG-2"),
  p3: person("p3", "Cleo Hidden", "hidden", "PG-3"),
  p4: person("p4", '=HYPERLINK("x")', "published"),
  p5: person("p5", "Eli Sorti", "published", "PG-5"),
};

const episodes: GovernmentEpisode[] = [
  ep({
    politicianId: "p1",
    type: "PREMIER_MINISTRE",
    title: "Premier ministre",
    mandatePublicId: "MA-1",
    startAct: act("Décret du 20 mai 2022", "https://example.org/decret"),
    startDetermination: "EXPLICIT",
  }),
  ep({ politicianId: "p1", title: "Ministre de l'Intérieur", start: "2022-05-21" }),
  ep({ politicianId: "p2" }),
  ep({ politicianId: "p3" }),
  ep({ politicianId: "p4", mandatePublicId: null }),
  ep({
    politicianId: "p5",
    start: "2022-05-20",
    end: "2023-03-01",
    endEvidence: "ACT",
    endKind: "INDIVIDUAL",
    endSourceUrl: "https://example.org/fin",
  }),
  ep({
    politicianId: "p4",
    title: "Secrétaire d'État",
    type: "SECRETAIRE_ETAT",
    end: "2024-01-08",
    endEvidence: "ACT",
    endKind: "COLLECTIVE_RESIGNATION",
  }),
];

const call = async (
  handler: typeof getPersonnes | typeof getComposition,
  url: string,
  slug?: string
) =>
  handler(new NextRequest(url), {
    params: Promise.resolve<Record<string, string>>(slug ? { slug } : {}),
  });

/** Rows without the BOM and the header, each split on bare commas (fixtures have no quoted comma). */
async function lines(response: Response) {
  const text = (await response.text()).replace(/^﻿/, "");
  const [header, ...rows] = text.split("\n");
  return { header: header!.split(","), rows, text };
}

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(getPublishedGovernments).mockResolvedValue([G]);
  vi.mocked(getGovernmentEpisodes).mockResolvedValue({ episodes, people });
  vi.mocked(getGovernmentMemberAffairs).mockResolvedValue({});
});

const BASE = "https://poligraph.fr/api/export/gouvernements";

describe("export des personnes", () => {
  it("a une ligne par personne distincte, sans fiche cachée, avec les colonnes de la spec", async () => {
    const res = await call(getPersonnes, `${BASE}/personnes`);
    expect(res.status).toBe(200);
    const { header, rows, text } = await lines(res);
    expect(header).toEqual([
      "pg_id",
      "nom",
      "url_profil",
      "gouvernements",
      "fonctions",
      "premiere_nomination",
      "derniere_fin",
      "periode_a_preciser",
      "sources",
      "detail",
    ]);
    // p1, p2, p4, p5 : quatre personnes distinctes pour sept fonctions ; p3 est cachée.
    expect(rows).toHaveLength(4);
    expect(text).not.toContain("Hidden");
    expect(text).not.toContain("PG-3");
  });

  it("laisse url_profil vide pour une fiche non publiée et pg_id vide sans identifiant", async () => {
    const { rows } = await lines(await call(getPersonnes, `${BASE}/personnes`));
    const pending = rows.find((r) => r.includes("Bob Pending"))!;
    expect(pending.split(",")[2]).toBe("");
    const published = rows.find((r) => r.includes("Alix Premiere"))!;
    expect(published.split(",")[2]).toBe("https://poligraph.fr/politiques/p1");
    const noId = rows.find((r) => r.includes("HYPERLINK"))!;
    expect(noId.startsWith(",")).toBe(true);
  });

  it("compte les fonctions, la première nomination, la dernière fin et les sources", async () => {
    const { rows } = await lines(await call(getPersonnes, `${BASE}/personnes`));
    const alix = rows.find((r) => r.includes("Alix Premiere"))!.split(",");
    expect(alix[3]).toBe("gouvernement-un");
    expect(alix[4]).toBe("2");
    expect(alix[5]).toBe("2022-05-20");
    expect(alix[6]).toBe(""); // fin inconnue
    expect(alix[8]).toBe("https://example.org/decret");
    expect(alix[9]).toContain("/api/export/gouvernements/fonctions?");
    expect(alix[9]).toContain("personne=p1");
    expect(alix[9]).not.toContain("q=p1");
  });

  it("reconstruit le lien de détail à partir des seuls paramètres connus", async () => {
    const { rows } = await lines(
      await call(getPersonnes, `${BASE}/personnes?fonction=pm&utm_source=x&page=3&evil=%3D1`)
    );
    const detail = new URL(rows.find((r) => r.includes("Alix Premiere"))!.split(",")[9]!);
    expect([...detail.searchParams.keys()].sort()).toEqual(["fonction", "personne"]);
    expect(detail.searchParams.get("fonction")).toBe("pm");
  });

  it("suit les mêmes filtres que la page (fonction)", async () => {
    const { rows } = await lines(await call(getPersonnes, `${BASE}/personnes?fonction=pm`));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Alix Premiere");
  });

  it("suit le filtre affaires de la page et le garde dans le lien de détail", async () => {
    vi.mocked(getGovernmentMemberAffairs).mockResolvedValue({
      p5: { definitive: 1, nonDefinitive: 0, ongoing: 0 },
    });
    const { rows } = await lines(
      await call(getPersonnes, `${BASE}/personnes?affaires=condamnation-definitive`)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Eli Sorti");
    const detail = new URL(rows[0]!.split(",")[9]!);
    expect(detail.searchParams.get("affaires")).toBe("condamnation-definitive");
  });

  it("neutralise les formules dans les noms", async () => {
    const { text } = await lines(await call(getPersonnes, `${BASE}/personnes`));
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("répond 404 quand la rubrique est désactivée", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await call(getPersonnes, `${BASE}/personnes`)).status).toBe(404);
  });

  it("porte le tag d'export et le cache CDN", async () => {
    const res = await call(getPersonnes, `${BASE}/personnes`);
    const expected = "public, s-maxage=86400, stale-while-revalidate=604800";
    expect(res.headers.get("Cache-Control")).toBe(expected);
    const tags = res.headers.get("Vercel-Cache-Tag")?.split(",") ?? [];
    expect(tags).toContain("export:governments");
    expect(tags).toContain("exports");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="membres-gouvernements-personnes-\d{4}-\d{2}-\d{2}\.csv"$/
    );
  });
});

describe("export des fonctions", () => {
  it("a une ligne par fonction, avec mode et acte de chaque date", async () => {
    const res = await call(getFonctions, `${BASE}/fonctions`);
    const { header, rows, text } = await lines(res);
    expect(header).toEqual([
      "ma_id",
      "pg_id",
      "nom",
      "url_profil",
      "gouvernement",
      "slug_gouvernement",
      "type",
      "intitule",
      "debut",
      "preuve_debut",
      "mode_debut",
      "acte_debut",
      "source_debut",
      "fin",
      "preuve_fin",
      "mode_fin",
      "acte_fin",
      "source_fin",
      "nature_fin",
      "affaires_courantes_jusqu_au",
      "derniere_confirmation",
    ]);
    // Sept fonctions, moins celle de la personne cachée.
    expect(rows).toHaveLength(6);
    expect(text).not.toContain("Hidden");
    const pm = rows.find((r) => r.startsWith("MA-1,"))!.split(",");
    expect(pm[9]).toBe("acte");
    expect(pm[10]).toBe("explicite");
    expect(pm[11]).toBe("Décret du 20 mai 2022");
    expect(pm[12]).toBe("https://example.org/decret");
  });

  it("qualifie la fin : nature individuelle ou cessation collective, affaires courantes attestées", async () => {
    const { rows } = await lines(await call(getFonctions, `${BASE}/fonctions`));
    const individual = rows.find((r) => r.includes("Eli Sorti"))!.split(",");
    expect(individual[18]).toBe("individuelle");
    expect(individual[19]).toBe("");
    const collective = rows.find((r) => r.includes("Secrétaire d'État"))!.split(",");
    expect(collective[18]).toBe("cessation collective");
    // Régime attesté : la veille de la fin du gouvernement.
    expect(collective[19]).toBe("2024-01-31");
  });

  it.each([
    ["borne individuelle plus courte", "2024-01-20", "2024-01-20"],
    ["borne individuelle au-delà de la veille, plafonnée", "2024-02-10", "2024-01-31"],
  ])("affaires_courantes_jusqu_au : %s", async (_label, bound, expected) => {
    vi.mocked(getGovernmentEpisodes).mockResolvedValue({
      episodes: episodes.map((e) =>
        e.title === "Secrétaire d'État" ? { ...e, currentAffairsEndedAt: bound } : e
      ),
      people,
    });
    const { rows } = await lines(await call(getFonctions, `${BASE}/fonctions`));
    const collective = rows.find((r) => r.includes("Secrétaire d'État"))!.split(",");
    expect(collective[19]).toBe(expected);
  });

  it("laisse affaires_courantes_jusqu_au vide quand le régime n'est pas attesté", async () => {
    vi.mocked(getPublishedGovernments).mockResolvedValue([{ ...G, currentAffairsAttested: false }]);
    const { rows } = await lines(await call(getFonctions, `${BASE}/fonctions`));
    const collective = rows.find((r) => r.includes("Secrétaire d'État"))!.split(",");
    expect(collective[19]).toBe("");
  });

  it("laisse affaires_courantes_jusqu_au vide quand la démission n'est pas prouvée par un acte", async () => {
    vi.mocked(getPublishedGovernments).mockResolvedValue([{ ...G, resignedEvidence: "DATASET" }]);
    const { rows } = await lines(await call(getFonctions, `${BASE}/fonctions`));
    const collective = rows.find((r) => r.includes("Secrétaire d'État"))!.split(",");
    expect(collective[19]).toBe("");
  });

  it("répond 404 quand la rubrique est désactivée", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await call(getFonctions, `${BASE}/fonctions`)).status).toBe(404);
  });
});

describe("export de la composition d'un gouvernement", () => {
  const CATEGORIES = ["établie", "affaires courantes", "transition", "à préciser"];

  it.each(["2023-06-01", "2024-01-09"])(
    "donne les mêmes catégories que compositionAt au %s",
    async (date) => {
      const res = await call(getComposition, `${BASE}/${G.slug}?date=${date}`, G.slug);
      expect(res.status).toBe(200);
      const { header, rows } = await lines(res);
      expect(header.at(-1)).toBe("categorie");

      const result = compositionAt(
        G,
        episodes.filter((e) => e.governmentId === G.id),
        date
      );
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      const visible = (list: { politicianId: string }[]) =>
        list.filter((e) => people[e.politicianId]!.visibility !== "hidden").length;
      const expected = [
        visible(result.byCategory.established),
        visible(result.byCategory.currentAffairs),
        visible(result.byCategory.transition),
        visible(result.byCategory.undocumented),
      ];
      const actual = CATEGORIES.map((c) => rows.filter((r) => r.endsWith(`,${c}`)).length);
      expect(actual).toEqual(expected);
      expect(actual.reduce((a, b) => a + b, 0)).toBe(rows.length);
    }
  );

  it("remplace une date invalide ou absente par la dernière date consultable", async () => {
    const fallback = await lines(await call(getComposition, `${BASE}/${G.slug}`, G.slug));
    const invalid = await lines(
      await call(getComposition, `${BASE}/${G.slug}?date=2024-02-30`, G.slug)
    );
    const explicit = await lines(
      await call(getComposition, `${BASE}/${G.slug}?date=${consultableRange(G)!.to}`, G.slug)
    );
    expect(invalid.rows).toEqual(fallback.rows);
    expect(explicit.rows).toEqual(fallback.rows);
    expect(fallback.rows.length).toBeGreaterThan(0);
  });

  it("n'expose ni fiche cachée ni identifiant inventé", async () => {
    const { text, rows } = await lines(
      await call(getComposition, `${BASE}/${G.slug}?date=2023-06-01`, G.slug)
    );
    expect(text).not.toContain("Hidden");
    const pending = rows.find((r) => r.includes("Bob Pending"))!.split(",");
    expect(pending[3]).toBe("");
  });

  it("répond 404 pour un gouvernement non publié (absent de la liste publiée)", async () => {
    vi.mocked(getPublishedGovernments).mockResolvedValue([]);
    const res = await call(getComposition, `${BASE}/${G.slug}`, G.slug);
    expect(res.status).toBe(404);
  });

  it("répond 404 pour un slug inconnu et quand la rubrique est désactivée", async () => {
    expect((await call(getComposition, `${BASE}/inconnu`, "inconnu")).status).toBe(404);
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await call(getComposition, `${BASE}/${G.slug}`, G.slug)).status).toBe(404);
  });

  it("porte le tag d'export", async () => {
    const res = await call(getComposition, `${BASE}/${G.slug}`, G.slug);
    const tags = res.headers.get("Vercel-Cache-Tag")?.split(",") ?? [];
    expect(tags).toEqual(expect.arrayContaining(["export:governments", "exports"]));
  });
});
