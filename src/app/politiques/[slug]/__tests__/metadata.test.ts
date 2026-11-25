import { describe, it, expect, vi, beforeEach } from "vitest";

// generateMetadata only reads the identity of the profile document. Stub Prisma so the module
// imports with no DATABASE_URL, and the cache primitives so nothing runs
// outside a Next request.
const readIdentity = vi.fn();
const readCandidacy = vi.fn();
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/data/politician-profile", () => ({
  getPoliticianProfile: async (slug: string) => {
    const identity = await readIdentity(slug);
    return identity ? { identity } : null;
  },
  readProfileSnapshot: vi.fn(),
}));
vi.mock("@/lib/data/politician-candidacy", () => ({
  getPoliticianPresidentialCandidacy: (id: string) => readCandidacy(id),
}));

import { generateMetadata } from "@/app/politiques/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  readIdentity.mockReset();
  readCandidacy.mockReset();
  readCandidacy.mockResolvedValue(null);
});

const identity = (overrides: Record<string, unknown> = {}) => ({
  id: "p1",
  fullName: "Jean Dupont",
  photoUrl: null,
  biography: "Une biographie substantielle.",
  currentParty: { shortName: "XX" },
  mandates: [
    {
      type: "DEPUTE",
      title: "Député de la 3ème circonscription de l'Yonne",
      isCurrent: true,
      startDate: "2017-06-21T00:00:00.000Z",
      localData: null,
    },
    {
      type: "CONSEILLER_MUNICIPAL",
      title: "conseiller municipal de Sens",
      isCurrent: false,
      startDate: "2014-03-30T00:00:00.000Z",
      localData: null,
    },
  ],
  declarations: [{ type: "INTERETS", details: null }],
  _count: { affairs: 1, factCheckMentions: 3 },
  ...overrides,
});

describe("/politiques/[slug] metadata", () => {
  it("noindex un profil inexistant au lieu de l'offrir à l'indexation", async () => {
    readIdentity.mockResolvedValue(null);

    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Politicien non trouvé");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("titre la fiche par les rubriques qu'elle contient, sans jamais nommer les affaires", async () => {
    readIdentity.mockResolvedValue(identity());

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Jean Dupont : mandats et fact-checks");
    expect(m.alternates?.canonical).toBe("/politiques/jean-dupont");
    expect(m.robots).not.toEqual({ index: false, follow: true });
  });

  it("décrit la fiche par ses chiffres", async () => {
    readIdentity.mockResolvedValue(identity());

    const m = await metadataFor("jean-dupont");

    expect(m.description).toBe(
      "Député de la 3ème circonscription de l'Yonne (XX). 2 mandats depuis 2014, 3 fact-checks, déclarations d'intérêts (HATVP)."
    );
  });

  it("ne cite ni le mot ni le nombre des affaires, même quand la fiche en porte", async () => {
    readIdentity.mockResolvedValue(identity({ _count: { affairs: 9, factCheckMentions: 0 } }));

    const m = await metadataFor("jean-dupont");
    const text = `${m.title} ${m.description}`;

    expect(text).not.toMatch(/affaire|procédure|judiciaire|condamn/i);
    expect(text).not.toMatch(/\b9\b/);
  });

  it("annonce une candidature déclarée, pas une personnalité pressentie", async () => {
    readIdentity.mockResolvedValue(identity());
    readCandidacy.mockResolvedValue({ status: "DECLARE" });

    const declared = await metadataFor("jean-dupont");

    expect(declared.title).toBe("Jean Dupont : candidature 2027, mandats et fact-checks");
    expect(declared.description).toContain("Candidature annoncée à la présidentielle 2027.");

    readCandidacy.mockResolvedValue({ status: "PRESSENTI" });
    const expected = await metadataFor("jean-dupont");

    expect(expected.title).toBe("Jean Dupont : mandats et fact-checks");
    expect(expected.description).not.toContain("2027");
  });

  it("parle de patrimoine seulement si une déclaration de patrimoine existe", async () => {
    readIdentity.mockResolvedValue(
      identity({
        declarations: [
          { type: "INTERETS", details: null },
          { type: "PATRIMOINE_DEBUT_MANDAT", details: null },
        ],
        _count: { affairs: 0, factCheckMentions: 0 },
      })
    );

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Jean Dupont : mandats et patrimoine");
    expect(m.description).toContain("déclarations de patrimoine et d'intérêts (HATVP)");
  });

  it("met une majuscule à un intitulé de mandat stocké en minuscule", async () => {
    readIdentity.mockResolvedValue(
      identity({
        mandates: [
          {
            type: "DEPUTE_EUROPEEN",
            title: "député européen",
            isCurrent: true,
            startDate: "2014-07-01T00:00:00.000Z",
            localData: null,
          },
        ],
      })
    );

    const m = await metadataFor("jean-dupont");

    expect(m.description).toMatch(/^Député européen \(XX\)\. /);
    expect(m.description).not.toContain("1 mandat");
  });

  it("ne répète pas le sigle du parti déjà présent dans l'intitulé du mandat", async () => {
    readIdentity.mockResolvedValue(
      identity({
        currentParty: { shortName: "UPR", name: "Union populaire républicaine" },
        mandates: [
          {
            type: "PRESIDENT_PARTI",
            title: "Président de l'Union populaire républicaine (UPR)",
            isCurrent: true,
            startDate: "2007-03-25T00:00:00.000Z",
            localData: null,
          },
        ],
      })
    );

    const m = await metadataFor("jean-dupont");

    expect(m.description).toMatch(/^Président de l'Union populaire républicaine \(UPR\)\. /);
  });

  it("nomme le parti quand aucun mandat n'est en cours", async () => {
    readIdentity.mockResolvedValue(
      identity({
        currentParty: { shortName: "XX", name: "Parti Exemple" },
        mandates: [],
        declarations: [],
        _count: { affairs: 0, factCheckMentions: 0 },
      })
    );
    readCandidacy.mockResolvedValue({ status: "DECLARE" });

    const m = await metadataFor("jean-dupont");

    expect(m.title).toBe("Jean Dupont : candidature 2027");
    expect(m.description).toBe(
      "Parti : Parti Exemple. Candidature annoncée à la présidentielle 2027."
    );
  });
});
