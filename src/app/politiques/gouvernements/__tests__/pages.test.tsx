import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernmentEpisode, PersonCard, PublishedGovernment } from "@/lib/governments/mapping";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/data/governments", () => ({
  getPublishedGovernments: vi.fn(),
  getGovernmentEpisodes: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/politiques/gouvernements",
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import { getGovernmentEpisodes, getPublishedGovernments } from "@/lib/data/governments";
import DirectoryPage from "../page";
import DetailPage from "../[slug]/page";
import MembersPage from "../membres/page";

// --- Fixtures ---------------------------------------------------------------

function gov(overrides: Partial<PublishedGovernment>): PublishedGovernment {
  return {
    id: "g",
    slug: "g",
    name: "Gouvernement",
    sequence: 1,
    primeMinisterAppointedAt: "2022-05-20",
    formedAt: "2022-05-20",
    resignedAt: null,
    resignedEvidence: null,
    endedAt: null,
    compositionVerifiedAt: null,
    currentAffairsAttested: false,
    hasDerivedDate: false,
    primeMinister: { slug: "alix-premiere", fullName: "Alix Première", gender: "F" },
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
    determinations: {
      primeMinisterAppointed: null,
      formed: null,
      resigned: null,
      ended: null,
    },
    participantCount: 0,
    hiddenCount: 0,
    updatedAt: "2026-10-10T00:00:00.000Z",
    ...overrides,
  };
}

let seq = 0;
function ep(overrides: Partial<GovernmentEpisode>): GovernmentEpisode {
  seq += 1;
  return {
    membershipId: `ms-${seq}`,
    mandateId: `m-${seq}`,
    mandatePublicId: null,
    governmentId: "g",
    politicianId: "p",
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
  gender: PersonCard["gender"] = "M"
): PersonCard {
  return {
    id,
    publicId: null,
    slug: id,
    fullName,
    lastName: fullName.split(" ").at(-1)!,
    gender,
    photoUrl: null,
    blobPhotoUrl: null,
    visibility,
  };
}

// Gouvernement A : terminé, complet. Le 4 juillet 2023, une sortie et une entrée sans lien,
// dates issues du jeu de données : règle 4, les deux sont en transition.
const A = gov({
  id: "ga",
  slug: "gouvernement-a",
  name: "Gouvernement Alpha",
  sequence: 1,
  primeMinister: { slug: "alix-premiere", fullName: "Alix Première", gender: "F" },
  endedAt: "2024-01-08",
  compositionVerifiedAt: "2024-01-08",
  participantCount: 5,
});

// Gouvernement B : terminé, une personne cachée, donc « au moins ».
const B = gov({
  id: "gb",
  slug: "gouvernement-b",
  name: "Gouvernement Bravo",
  sequence: 2,
  primeMinisterAppointedAt: "2024-01-09",
  formedAt: "2024-01-09",
  endedAt: "2024-09-01",
  compositionVerifiedAt: "2024-09-01",
  primeMinister: { slug: "bruno-second", fullName: "Bruno Second", gender: "M" },
  participantCount: 1,
  hiddenCount: 1,
});

// Gouvernement C : démissionnaire, affaires courantes attestées par un acte.
const C = gov({
  id: "gc",
  slug: "gouvernement-c",
  name: "Gouvernement Charlie",
  sequence: 3,
  primeMinisterAppointedAt: "2024-09-05",
  formedAt: "2024-09-21",
  resignedAt: "2024-12-05",
  resignedEvidence: "ACT",
  endedAt: "2024-12-23",
  compositionVerifiedAt: "2024-12-23",
  currentAffairsAttested: true,
  primeMinister: { slug: "chloe-tierce", fullName: "Chloé Tierce", gender: "F" },
  participantCount: 1,
});

// Gouvernement D : en exercice, aucune composition vérifiée.
const D = gov({
  id: "gd",
  slug: "gouvernement-d",
  name: "Gouvernement Delta",
  sequence: 4,
  primeMinisterAppointedAt: "2025-10-10",
  formedAt: "2025-10-12",
  primeMinister: { slug: "denis-quart", fullName: "Denis Quart", gender: "M" },
  participantCount: 1,
});

const DRAFT_SLUG = "gouvernement-brouillon";

const people: Record<string, PersonCard> = {
  "alix-premiere": person("alix-premiere", "Alix Première", "published", "F"),
  "karim-public": person("karim-public", "Karim Public", "published"),
  "noemie-attente": person("noemie-attente", "Noémie Attente", "pending", "F"),
  "pascal-sortant": person("pascal-sortant", "Pascal Sortant", "published"),
  "ines-entrante": person("ines-entrante", "Inès Entrante", "published", "F"),
  "bruno-second": person("bruno-second", "Bruno Second", "published"),
  "cache-cache": person("cache-cache", "Cécile Cachée", "hidden", "F"),
  "chloe-tierce": person("chloe-tierce", "Chloé Tierce", "published", "F"),
  "denis-quart": person("denis-quart", "Denis Quart", "published"),
};

const episodes: GovernmentEpisode[] = [
  ep({
    governmentId: "ga",
    politicianId: "alix-premiere",
    type: "PREMIER_MINISTRE",
    title: "Première ministre",
    end: "2024-01-08",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "ga",
    politicianId: "karim-public",
    title: "Ministre de l'Économie",
    end: "2024-01-08",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "ga",
    politicianId: "noemie-attente",
    type: "MINISTRE_DELEGUE",
    title: "Ministre déléguée chargée des Comptes publics",
    end: "2024-01-08",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "ga",
    politicianId: "pascal-sortant",
    title: "Ministre de la Transition écologique",
    end: "2023-07-04",
    endEvidence: "DATASET",
  }),
  ep({
    governmentId: "ga",
    politicianId: "ines-entrante",
    title: "Ministre de la Transition écologique et de la Cohésion des territoires",
    start: "2023-07-04",
    startEvidence: "DATASET",
    end: "2024-01-08",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "gb",
    politicianId: "bruno-second",
    type: "PREMIER_MINISTRE",
    title: "Premier ministre",
    start: "2024-01-09",
    end: "2024-09-01",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "gb",
    politicianId: "cache-cache",
    title: "Ministre cachée",
    start: "2024-01-09",
    end: "2024-09-01",
    endEvidence: "ACT",
  }),
  ep({
    governmentId: "gc",
    politicianId: "chloe-tierce",
    type: "PREMIER_MINISTRE",
    title: "Première ministre",
    start: "2024-09-21",
    end: "2024-12-05",
    endEvidence: "ACT",
    endKind: "COLLECTIVE_RESIGNATION",
  }),
  ep({
    governmentId: "gd",
    politicianId: "denis-quart",
    type: "PREMIER_MINISTRE",
    title: "Premier ministre",
    start: "2025-10-12",
  }),
];

const GOVS = [A, B, C, D];

beforeEach(() => {
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(getPublishedGovernments).mockResolvedValue(GOVS);
  vi.mocked(getGovernmentEpisodes).mockResolvedValue({ episodes, people });
});

async function html(element: Promise<React.ReactElement>): Promise<string> {
  const { container } = render(await element);
  return container.innerHTML;
}

function text(markup: string): string {
  const div = document.createElement("div");
  div.innerHTML = markup;
  return (div.textContent ?? "").replace(/\s+/g, " ");
}

const sp = (v: Record<string, string> = {}) => Promise.resolve(v);
const detail = (slug: string, query: Record<string, string> = {}) =>
  DetailPage({ params: Promise.resolve({ slug }), searchParams: sp(query) });

// --- Tests ------------------------------------------------------------------

describe("drapeau gouvernements", () => {
  it("renvoie notFound sur les trois pages quand le drapeau est désactivé", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    await expect(DirectoryPage({ searchParams: sp() })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(detail("gouvernement-a")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(MembersPage({ searchParams: sp() })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("détail d'un gouvernement", () => {
  it("renvoie notFound pour un slug inconnu ou non publié", async () => {
    await expect(detail("inconnu")).rejects.toThrow("NEXT_NOT_FOUND");
    // Un gouvernement DRAFT n'est jamais renvoyé par getPublishedGovernments.
    await expect(detail(DRAFT_SLUG)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lie les fiches publiées et laisse en texte les fiches en attente", async () => {
    const markup = await html(detail("gouvernement-a", { date: "2023-06-01" }));
    expect(markup).toContain('href="/politiques/karim-public"');
    expect(markup).toContain('href="/politiques/alix-premiere"');
    expect(markup).not.toContain('href="/politiques/noemie-attente"');
    expect(text(markup)).toContain("Noémie Attente");
    expect(text(markup)).toContain("profil public en cours de constitution");
  });

  it("exclut les personnes en transition de l'effectif établi et les liste à part", async () => {
    const t = text(await html(detail("gouvernement-a", { date: "2023-07-04" })));
    expect(t).toContain("3 personnes présentes de façon établie au 4 juillet 2023");
    expect(t).toContain("Transition du 4 juillet 2023");
    expect(t).toContain("2 personnes concernées");
    expect(t).toContain("Pascal Sortant");
    expect(t).toContain("Inès Entrante");
  });

  it("qualifie l'effectif « au moins » quand une personne est cachée", async () => {
    const markup = await html(detail("gouvernement-b", { date: "2024-03-01" }));
    const t = text(markup);
    expect(t).toContain("au moins 1 personne présente de façon établie au 1er mars 2024");
    expect(t).not.toContain("Cécile Cachée");
  });

  it("affiche le bandeau des affaires courantes", async () => {
    const t = text(await html(detail("gouvernement-c", { date: "2024-12-10" })));
    expect(t).toContain("Gouvernement démissionnaire chargé des affaires courantes");
    expect(t).toContain("1 personne présente de façon établie au 10 décembre 2024");
  });

  it("affiche « Composition non établie » pour un gouvernement en exercice non vérifié", async () => {
    const t = text(await html(detail("gouvernement-d")));
    expect(t).toContain("Composition non établie");
    expect(t).not.toContain("présentes de façon établie");
  });

  it("signale une date hors période", async () => {
    const t = text(await html(detail("gouvernement-a", { date: "2020-03-02" })));
    expect(t).toContain("Date hors période");
    expect(t).toContain("antérieur");
  });

  it("n'écrit jamais « depuis »", async () => {
    for (const markup of [
      await html(detail("gouvernement-a")),
      await html(detail("gouvernement-c", { date: "2024-12-10" })),
      await html(detail("gouvernement-d")),
    ]) {
      expect(text(markup).toLowerCase()).not.toContain("depuis");
    }
  });
});

describe("répertoire", () => {
  it("liste les gouvernements publiés avec un lien vers chaque composition", async () => {
    const markup = await html(DirectoryPage({ searchParams: sp() }));
    expect(markup).toContain('href="/politiques/gouvernements/gouvernement-a"');
    expect(markup).toContain('href="/politiques/gouvernements/membres"');
    const t = text(markup);
    expect(t).toContain("5 personnes ont participé");
    expect(t).toContain("au moins 1 personne documentée");
    expect(t.toLowerCase()).not.toContain("depuis");
  });

  it("filtre par nom sans tenir compte des accents", async () => {
    const t = text(await html(DirectoryPage({ searchParams: sp({ q: "chloe" }) })));
    expect(t).toContain("Gouvernement Charlie");
    expect(t).not.toContain("Gouvernement Alpha");
  });
});

describe("membres", () => {
  it("lie les fiches publiées, jamais les fiches en attente ni cachées", async () => {
    const markup = await html(MembersPage({ searchParams: sp() }));
    expect(markup).toContain('href="/politiques/karim-public"');
    expect(markup).not.toContain('href="/politiques/noemie-attente"');
    expect(text(markup)).toContain("Noémie Attente");
    expect(text(markup)).not.toContain("Cécile Cachée");
    expect(text(markup).toLowerCase()).not.toContain("depuis");
  });

  it("filtre par nom", async () => {
    const t = text(await html(MembersPage({ searchParams: sp({ q: "ines" }) })));
    expect(t).toContain("Inès Entrante");
    expect(t).not.toContain("Karim Public");
  });

  it("s'affiche sans erreur quand le gouvernement d'une fonction est absent", async () => {
    const orphan = ep({
      governmentId: "absent",
      politicianId: "karim-public",
      title: "Fonction orpheline",
    });
    vi.mocked(getGovernmentEpisodes).mockResolvedValue({
      episodes: [...episodes, orphan],
      people,
    });
    const t = text(await html(MembersPage({ searchParams: sp() })));
    expect(t).toContain("Karim Public");
    expect(t).not.toContain("Fonction orpheline");
  });

  it("garde le panneau de filtres utilisable sans JavaScript", async () => {
    const markup = await html(MembersPage({ searchParams: sp({ fonction: "ministre" }) }));
    const div = document.createElement("div");
    div.innerHTML = markup;
    const details = div.querySelector("form details");
    expect(details?.querySelector("summary")?.textContent).toContain("Filtres (1)");
    expect(details?.querySelector('button[type="submit"]')?.textContent).toContain("Appliquer");
  });
});
