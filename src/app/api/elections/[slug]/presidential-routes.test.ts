import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicPresidentialCandidacyField: vi.fn(),
  getPublicElectionIdentity: vi.fn(),
  hasPublicTrackedPresidentialCandidacy: vi.fn(),
  listPublicPresidentialMeasures: vi.fn(),
}));

vi.mock("@/lib/api/with-public-route", () => ({
  withPublicRoute: <T extends (...args: never[]) => unknown>(handler: T) => handler,
}));
vi.mock("@/lib/cache", () => ({
  withCache: (response: Response) => response,
}));
vi.mock("@/lib/data/presidential-candidacy-field", () => ({
  getPublicPresidentialCandidacyField: mocks.getPublicPresidentialCandidacyField,
  getPublicElectionIdentity: mocks.getPublicElectionIdentity,
  hasPublicTrackedPresidentialCandidacy: mocks.hasPublicTrackedPresidentialCandidacy,
}));
vi.mock("@/lib/data/measures", () => ({
  listPublicPresidentialMeasures: mocks.listPublicPresidentialMeasures,
}));

import { GET as getCandidacies } from "./candidacies/route";
import { GET as getMeasures } from "./measures/route";

const context = { params: Promise.resolve({ slug: "presidentielle-2027" }) };
const election = {
  id: "election-1",
  slug: "presidentielle-2027",
  title: "Élection présidentielle 2027",
  type: "PRESIDENTIELLE",
};

function candidacy(
  id: string,
  status: "DECLARE" | "PRESSENTI" | "ENVISAGE" | "RETIRE",
  programmeAbsence: "aucun_programme" | "non_depouille" | null,
  measureCount: number
) {
  return {
    id,
    candidateName: `Candidate ${id}`,
    politicianSlug: `candidate-${id}`,
    photoUrl: null,
    blobPhotoUrl: null,
    status,
    sourceUrl: `https://example.org/source-${id}`,
    sourceLabel: `Source ${id}`,
    partyLabel: `Parti ${id}`,
    partyColor: null,
    partyShortName: `P${id}`,
    partyLogoUrl: null,
    measureCount,
    themesCoveredCount: measureCount > 0 ? 1 : 0,
    programmeAbsence,
  };
}

describe("GET /api/elections/[slug]/candidacies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPresidentialCandidacyField.mockResolvedValue({
      election,
      candidacies: [
        candidacy("1", "DECLARE", null, 2),
        candidacy("2", "PRESSENTI", "non_depouille", 0),
        candidacy("3", "ENVISAGE", "aucun_programme", 0),
        candidacy("4", "RETIRE", "aucun_programme", 0),
      ],
    });
  });

  it("retourne le suivi sourcé, les libellés et les trois états sans statut officiel", async () => {
    const response = await getCandidacies(
      new NextRequest("https://poligraph.fr/api/elections/presidentielle-2027/candidacies"),
      context
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.data.map((item: { trackingStatus: { label: string } }) => item.trackingStatus.label)
    ).toEqual([
      "Candidature annoncée",
      "Personnalité pressentie",
      "Personnalité évoquée",
      "Candidature retirée",
    ]);
    expect(
      body.data.map((item: { programmeState: { code: string } }) => item.programmeState.code)
    ).toEqual([
      "PUBLISHED_MEASURES",
      "PROGRAM_IDENTIFIED_NO_PUBLISHED_MEASURES",
      "NO_PROGRAM_IDENTIFIED",
      "NO_PROGRAM_IDENTIFIED",
    ]);
    expect(body.meta.statusScope).toBe("PUBLIC_TRACKING_NOT_OFFICIAL_CANDIDATE_LIST");
    expect(body.data[0].trackingStatus.source).toEqual({
      label: "Source 1",
      url: "https://example.org/source-1",
    });
    expect(body.data[0]).not.toHaveProperty("statusSource");
    expect(JSON.stringify(body)).not.toMatch(/admin|moderation|secret|officialCandidate/i);
  });

  it("filtre le statut et la présence de mesures avec une pagination bornée", async () => {
    const response = await getCandidacies(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/candidacies?status=DECLARE&hasPublishedMeasures=true&page=1&limit=100"
      ),
      context
    );
    const body = await response.json();

    expect(body.data).toHaveLength(1);
    expect(body.data[0].trackingStatus.code).toBe("DECLARE");
    expect(body.pagination).toEqual({ page: 1, limit: 100, total: 1, totalPages: 1 });
  });

  it("isole les candidatures sans mesure publiée", async () => {
    const response = await getCandidacies(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/candidacies?hasPublishedMeasures=false"
      ),
      context
    );
    const body = await response.json();

    expect(body.data.map((item: { candidacyId: string }) => item.candidacyId)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });

  it.each([
    ["?status=OFFICIEL", "Statut de candidature invalide"],
    ["?hasPublishedMeasures=oui", "Filtre hasPublishedMeasures invalide"],
    ["?page=0", "Pagination invalide"],
    ["?page=1.5", "Pagination invalide"],
    ["?page=abc", "Pagination invalide"],
    ["?limit=101", "Pagination invalide"],
  ])("retourne 400 pour des paramètres invalides (%s)", async (query, error) => {
    const response = await getCandidacies(
      new NextRequest(`https://poligraph.fr/api/elections/presidentielle-2027/candidacies${query}`),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(mocks.getPublicPresidentialCandidacyField).not.toHaveBeenCalled();
  });

  it("distingue l'élection absente du type non supporté", async () => {
    mocks.getPublicPresidentialCandidacyField.mockResolvedValueOnce(null);
    const missing = await getCandidacies(
      new NextRequest("https://poligraph.fr/api/elections/inconnue/candidacies"),
      { params: Promise.resolve({ slug: "inconnue" }) }
    );
    expect(missing.status).toBe(404);

    mocks.getPublicPresidentialCandidacyField.mockResolvedValueOnce({
      election: { ...election, type: "MUNICIPALES" },
      candidacies: [],
    });
    const unsupported = await getCandidacies(
      new NextRequest("https://poligraph.fr/api/elections/municipales-2026/candidacies"),
      { params: Promise.resolve({ slug: "municipales-2026" }) }
    );
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toEqual({
      error: "Ce contrat est réservé aux élections présidentielles",
    });
  });
});

describe("GET /api/elections/[slug]/measures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicElectionIdentity.mockResolvedValue(election);
    mocks.hasPublicTrackedPresidentialCandidacy.mockResolvedValue(true);
    mocks.listPublicPresidentialMeasures.mockResolvedValue({
      total: 1,
      data: [
        {
          measureId: "measure-1",
          publishedRevisionId: "revision-1",
          text: "Mesure publiée et sourcée.",
          precision: { code: "OBJECTIF_SANS_CHIFFRE", label: "Objectif sans chiffre" },
          theme: {
            code: "SANTE",
            label: "Santé",
            slug: "sante",
            publicUrl: "/elections/presidentielle-2027/themes/sante",
          },
          attribution: { code: "PERSONAL", label: "Formulée personnellement" },
          candidacy: {
            candidacyId: "candidacy-1",
            candidateName: "Candidate test",
            politicianSlug: "candidate-test",
            publicUrl: "/elections/presidentielle-2027/candidats/candidate-test",
          },
          sources: [
            {
              sourceKind: "DISCOURS_CAMPAGNE",
              tier: "PRIMARY",
              url: "https://example.org/source",
              page: null,
              publishedAt: new Date("2027-01-01T00:00:00Z"),
            },
          ],
          subtopics: [],
          withdrawal: null,
        },
      ],
    });
  });

  it("retourne le DTO nominal et transmet les filtres avec une pagination bornée", async () => {
    const request = new NextRequest(
      "https://poligraph.fr/api/elections/presidentielle-2027/measures?candidateSlug=candidate-test&theme=sante&includeWithdrawn=true&page=2&limit=100"
    );
    const response = await getMeasures(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.hasPublicTrackedPresidentialCandidacy).toHaveBeenCalledWith(
      "election-1",
      "candidate-test"
    );
    expect(mocks.listPublicPresidentialMeasures).toHaveBeenCalledWith({
      electionId: "election-1",
      electionSlug: "presidentielle-2027",
      candidateSlug: "candidate-test",
      theme: "SANTE",
      includeWithdrawn: true,
      page: 2,
      limit: 100,
    });
    expect(body.pagination).toEqual({ page: 2, limit: 100, total: 1, totalPages: 1 });
    expect(body.meta.precisionField).toEqual({
      deprecated: true,
      meaning:
        "Indique uniquement si la formulation comporte une quantité explicite, en chiffres ou en toutes lettres.",
      caveat:
        "Ce champ ne décrit pas la nature de l'engagement et n'évalue ni son coût, ni son efficacité, ni sa faisabilité.",
    });
    expect(Object.keys(body.data[0]).sort()).toEqual([
      "attribution",
      "candidacy",
      "measureId",
      "precision",
      "publishedRevisionId",
      "sources",
      "subtopics",
      "text",
      "theme",
      "withdrawal",
    ]);
    expect(body.data[0].withdrawal).toBeNull();
    expect(body.data[0]).not.toHaveProperty("withdrawn");
    expect(JSON.stringify(body)).not.toMatch(/admin|reviewedBy|secret|publicationStatus/i);
  });

  it("sérialise un retrait avec trois champs directs et sans ancienne forme", async () => {
    mocks.listPublicPresidentialMeasures.mockResolvedValueOnce({
      total: 1,
      data: [
        {
          measureId: "measure-withdrawn",
          publishedRevisionId: "revision-withdrawn",
          text: "Mesure retirée et sourcée.",
          precision: { code: "OBJECTIF_SANS_CHIFFRE", label: "Objectif sans chiffre" },
          theme: {
            code: "SANTE",
            label: "Santé",
            slug: "sante",
            publicUrl: "/elections/presidentielle-2027/themes/sante",
          },
          attribution: { code: "PERSONAL", label: "Formulée personnellement" },
          candidacy: {
            candidacyId: "candidacy-1",
            candidateName: "Candidate test",
            politicianSlug: "candidate-test",
            publicUrl: "/elections/presidentielle-2027/candidats/candidate-test",
          },
          sources: [],
          withdrawal: {
            withdrawnAt: new Date("2027-03-01T00:00:00.000Z"),
            sourceUrl: "https://example.org/retrait",
            sourceLabel: null,
          },
        },
      ],
    });

    const response = await getMeasures(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/measures?includeWithdrawn=true"
      ),
      context
    );
    const body = await response.json();
    const item = body.data[0];

    expect(response.status).toBe(200);
    expect(item.withdrawal.withdrawnAt).toBe("2027-03-01T00:00:00.000Z");
    expect(item.withdrawal.sourceUrl).toBe("https://example.org/retrait");
    expect(item.withdrawal.sourceLabel).toBeNull();
    expect(item.withdrawal).not.toHaveProperty("withdrawn");
    expect(item.withdrawal).not.toHaveProperty("source");
  });

  it.each([
    ["?theme=inconnu", "Thème invalide"],
    ["?includeWithdrawn=oui", "Filtre includeWithdrawn invalide"],
    ["?candidateSlug=", "Candidature invalide"],
    [`?candidateSlug=${"a".repeat(201)}`, "Candidature invalide"],
    ["?page=0", "Pagination invalide"],
    ["?page=1.5", "Pagination invalide"],
    ["?limit=101", "Pagination invalide"],
  ])("retourne 400 avant toute lecture pour un filtre invalide (%s)", async (query, error) => {
    const response = await getMeasures(
      new NextRequest(`https://poligraph.fr/api/elections/presidentielle-2027/measures${query}`),
      context
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(mocks.getPublicElectionIdentity).not.toHaveBeenCalled();
    expect(mocks.listPublicPresidentialMeasures).not.toHaveBeenCalled();
  });

  it("garde le thème historique lisible pendant la requalification présidentielle", async () => {
    const response = await getMeasures(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/measures?theme=social-travail"
      ),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.getPublicElectionIdentity).toHaveBeenCalledWith("presidentielle-2027");
    expect(mocks.listPublicPresidentialMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "SOCIAL_TRAVAIL" })
    );
  });

  it("retourne 404 pour une élection ou une candidature absente", async () => {
    mocks.getPublicElectionIdentity.mockResolvedValueOnce(null);
    const missingElection = await getMeasures(
      new NextRequest("https://poligraph.fr/api/elections/inconnue/measures"),
      { params: Promise.resolve({ slug: "inconnue" }) }
    );
    expect(missingElection.status).toBe(404);

    mocks.hasPublicTrackedPresidentialCandidacy.mockResolvedValueOnce(false);
    const missingCandidate = await getMeasures(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/measures?candidateSlug=inconnue"
      ),
      context
    );
    expect(missingCandidate.status).toBe(404);
    expect(mocks.listPublicPresidentialMeasures).not.toHaveBeenCalled();
  });

  it("retourne 200 vide pour une candidature suivie dont la fiche n'est pas publiée", async () => {
    mocks.listPublicPresidentialMeasures.mockResolvedValueOnce({ total: 0, data: [] });
    const response = await getMeasures(
      new NextRequest(
        "https://poligraph.fr/api/elections/presidentielle-2027/measures?candidateSlug=charlie-fixture"
      ),
      context
    );

    expect(response.status).toBe(200);
    expect(mocks.hasPublicTrackedPresidentialCandidacy).toHaveBeenCalledWith(
      "election-1",
      "charlie-fixture"
    );
    expect(await response.json()).toEqual(
      expect.objectContaining({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      })
    );
  });

  it("rejette explicitement une élection non présidentielle", async () => {
    mocks.getPublicElectionIdentity.mockResolvedValueOnce({
      ...election,
      type: "MUNICIPALES",
    });
    const response = await getMeasures(
      new NextRequest("https://poligraph.fr/api/elections/municipales-2026/measures"),
      { params: Promise.resolve({ slug: "municipales-2026" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Ce contrat est réservé aux élections présidentielles",
    });
    expect(mocks.listPublicPresidentialMeasures).not.toHaveBeenCalled();
  });

  it("retourne une liste vide avec une pagination cohérente", async () => {
    mocks.listPublicPresidentialMeasures.mockResolvedValueOnce({ total: 0, data: [] });
    const response = await getMeasures(
      new NextRequest("https://poligraph.fr/api/elections/presidentielle-2027/measures"),
      context
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      })
    );
  });
});
