import { describe, expect, it } from "vitest";
import {
  personVisibility,
  toEpisode,
  toPersonCard,
  toPublishedGovernment,
  type EpisodeRow,
  type GovernmentRow,
} from "../mapping";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function act(id: string, overrides: Partial<NonNullable<GovernmentRow["formedAct"]>> = {}) {
  return {
    label: `Décret ${id}`,
    url: `https://www.legifrance.gouv.fr/jorf/id/${id}`,
    signedAt: d("2025-10-12"),
    journalPublishedAt: d("2025-10-13"),
    ...overrides,
  };
}

const politician: EpisodeRow["mandate"]["politician"] = {
  id: "p1",
  publicId: "PG-000001",
  slug: "jean-test",
  fullName: "Jean Test",
  lastName: "Test",
  civility: "M.",
  photoUrl: null,
  blobPhotoUrl: null,
  biography: null,
  publicationStatus: "PUBLISHED",
  statusOverride: false,
};

function govRow(overrides: Partial<GovernmentRow> = {}): GovernmentRow {
  return {
    id: "g1",
    slug: "lecornu-2",
    name: "Gouvernement Sébastien Lecornu II",
    sequence: 48,
    primeMinister: { slug: "sebastien-lecornu", fullName: "Sébastien Lecornu", civility: "M." },
    primeMinisterAppointedAt: d("2025-10-10"),
    primeMinisterAppointedEvidence: "ACT",
    formedAt: d("2025-10-12"),
    formedEvidence: "ACT",
    formedSourceUrl: "https://legacy/formed",
    resignedAt: null,
    resignedEvidence: null,
    resignedSourceUrl: "https://legacy/resigned",
    endedAt: null,
    endedEvidence: null,
    endedSourceUrl: null,
    completeness: "COMPLETE",
    pendingChanges: null,
    coverageNote: null,
    compositionVerifiedAt: d("2026-09-30"),
    compositionVerifiedSourceUrl: "https://verif",
    compositionCheckedAt: d("2026-10-10"),
    primeMinisterAppointedAct: null,
    formedAct: act("F"),
    resignedAct: null,
    endedAct: null,
    currentAffairsAct: null,
    currentAffairsActId: null,
    updatedAt: new Date("2026-10-10T08:30:00.000Z"),
    memberships: [],
    ...overrides,
  };
}

describe("toPublishedGovernment", () => {
  it("convertit les dates en jours UTC et préfère l'URL de l'acte", () => {
    const g = toPublishedGovernment(govRow());
    expect(g).toMatchObject({
      id: "g1",
      slug: "lecornu-2",
      primeMinisterAppointedAt: "2025-10-10",
      formedAt: "2025-10-12",
      resignedAt: null,
      endedAt: null,
      compositionVerifiedAt: "2026-09-30",
      compositionCheckedAt: "2026-10-10",
      currentAffairsAttested: false,
      hasDerivedDate: false,
      primeMinister: { slug: "sebastien-lecornu", fullName: "Sébastien Lecornu", gender: "M" },
      referenceSources: {
        formed: "https://www.legifrance.gouv.fr/jorf/id/F",
        resigned: "https://legacy/resigned",
        ended: null,
      },
      updatedAt: "2026-10-10T08:30:00.000Z",
    });
    expect(g.acts.formed).toEqual({
      label: "Décret F",
      url: "https://www.legifrance.gouv.fr/jorf/id/F",
      signedAt: "2025-10-12",
      journalPublishedAt: "2025-10-13",
    });
    expect(g.acts.resigned).toBeNull();
  });

  it("le régime d'affaires courantes est attesté par la présence de l'acte", () => {
    expect(
      toPublishedGovernment(govRow({ currentAffairsActId: "a1" })).currentAffairsAttested
    ).toBe(true);
  });

  it("signale une date estimée du gouvernement", () => {
    expect(toPublishedGovernment(govRow({ formedEvidence: "DERIVED" })).hasDerivedDate).toBe(true);
    expect(
      toPublishedGovernment(govRow({ primeMinisterAppointedEvidence: "DERIVED" })).hasDerivedDate
    ).toBe(true);
  });

  it("compte les personnes distinctes, sans les fiches cachées", () => {
    const m = (p: Partial<typeof politician>) => ({
      mandate: { politician: { ...politician, ...p } },
    });
    const g = toPublishedGovernment(
      govRow({
        memberships: [
          m({ id: "p1" }),
          m({ id: "p1" }),
          m({ id: "p2", publicationStatus: "DRAFT" }),
          m({ id: "p3", publicationStatus: "EXCLUDED" }),
        ],
      })
    );
    expect(g.participantCount).toBe(2);
  });
});

describe("personVisibility", () => {
  const v = (p: Partial<typeof politician>) => personVisibility({ ...politician, ...p });

  it("publiée", () => {
    expect(v({})).toBe("published");
    expect(v({ statusOverride: true })).toBe("published");
  });

  it("en attente : brouillon ou archive sans override, photo ni biographie", () => {
    expect(v({ publicationStatus: "DRAFT" })).toBe("pending");
    expect(v({ publicationStatus: "ARCHIVED" })).toBe("pending");
    expect(v({ publicationStatus: "DRAFT", biography: "   " })).toBe("pending");
  });

  it("cachée dans tous les autres cas", () => {
    expect(v({ publicationStatus: "EXCLUDED" })).toBe("hidden");
    expect(v({ publicationStatus: "REJECTED" })).toBe("hidden");
    expect(v({ publicationStatus: "DRAFT", statusOverride: true })).toBe("hidden");
    expect(v({ publicationStatus: "DRAFT", photoUrl: "https://x" })).toBe("hidden");
    expect(v({ publicationStatus: "DRAFT", blobPhotoUrl: "https://x" })).toBe("hidden");
    expect(v({ publicationStatus: "ARCHIVED", biography: "Bio." })).toBe("hidden");
  });
});

function episodeRow(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: "mg1",
    governmentId: "g1",
    startEvidence: "ACT",
    startSourceUrl: "https://legacy/start",
    endEvidence: "ACT",
    endSourceUrl: "https://legacy/end",
    endKind: "COLLECTIVE_RESIGNATION",
    predecessorId: "mg0",
    sameDayOrderEstablished: true,
    sameDayOrderSourceUrl: "https://order",
    currentAffairsEndedAt: d("2025-10-06"),
    startAct: null,
    endAct: { url: "https://act/end" },
    currentAffairsEndAct: { url: "https://act/ca" },
    mandate: {
      id: "m1",
      publicId: "MA-000001",
      type: "MINISTRE",
      title: "Ministre de l'Économie",
      startDate: d("2024-12-23"),
      endDate: d("2025-09-09"),
      lastConfirmedAt: null,
      politician,
    },
    ...overrides,
  };
}

describe("toEpisode", () => {
  it("convertit la ligne en épisode pur", () => {
    expect(toEpisode(episodeRow())).toEqual({
      membershipId: "mg1",
      mandateId: "m1",
      mandatePublicId: "MA-000001",
      governmentId: "g1",
      politicianId: "p1",
      type: "MINISTRE",
      title: "Ministre de l'Économie",
      start: "2024-12-23",
      startEvidence: "ACT",
      startSourceUrl: "https://legacy/start",
      end: "2025-09-09",
      endEvidence: "ACT",
      endSourceUrl: "https://act/end",
      endKind: "COLLECTIVE_RESIGNATION",
      lastConfirmedAt: null,
      predecessorMembershipId: "mg0",
      sameDayOrderEstablished: true,
      sameDayOrderSourceUrl: "https://order",
      currentAffairsEndedAt: "2025-10-06",
      currentAffairsEndSourceUrl: "https://act/ca",
    });
  });

  it("ignore une fonction qui n'est pas gouvernementale ou sans gouvernement", () => {
    expect(toEpisode(episodeRow({ governmentId: null }))).toBeNull();
    expect(
      toEpisode(episodeRow({ mandate: { ...episodeRow().mandate, type: "DEPUTE" } }))
    ).toBeNull();
  });
});

describe("toPersonCard", () => {
  it("expose l'identité, le genre et la visibilité, jamais la biographie", () => {
    const card = toPersonCard({ ...politician, civility: "Mme", biography: "Texte" });
    expect(card).toEqual({
      id: "p1",
      publicId: "PG-000001",
      slug: "jean-test",
      fullName: "Jean Test",
      lastName: "Test",
      gender: "F",
      photoUrl: null,
      blobPhotoUrl: null,
      visibility: "published",
    });
  });
});
