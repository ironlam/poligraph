import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernmentEpisode, PersonCard, PublishedGovernment } from "@/lib/governments/mapping";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/data/governments", () => ({
  getPublishedGovernments: vi.fn(),
  getGovernmentEpisodes: vi.fn(),
  getGovernmentEpisodesFor: vi.fn(),
}));
vi.mock("@/lib/data/government-affairs", () => ({ getGovernmentMemberAffairs: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/politiques/gouvernements",
}));

import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  getGovernmentEpisodes,
  getGovernmentEpisodesFor,
  getPublishedGovernments,
} from "@/lib/data/governments";
import { getGovernmentMemberAffairs } from "@/lib/data/government-affairs";
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
    primeMinister: {
      slug: "alix-premiere",
      fullName: "Alix Première",
      gender: "F",
      photoUrl: null,
      blobPhotoUrl: null,
    },
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
    pendingReason: visibility === "pending" ? "draft" : null,
    lifespan: null,
  };
}

// Gouvernement A : terminé, complet. Le 4 juillet 2023, une sortie et une entrée sans lien,
// dates issues du jeu de données : règle 4, les deux sont en transition.
const A = gov({
  id: "ga",
  slug: "gouvernement-a",
  name: "Gouvernement Alpha",
  sequence: 1,
  primeMinister: {
    slug: "alix-premiere",
    fullName: "Alix Première",
    gender: "F",
    photoUrl: null,
    blobPhotoUrl: null,
  },
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
  primeMinister: {
    slug: "bruno-second",
    fullName: "Bruno Second",
    gender: "M",
    photoUrl: null,
    blobPhotoUrl: null,
  },
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
  primeMinister: {
    slug: "chloe-tierce",
    fullName: "Chloé Tierce",
    gender: "F",
    photoUrl: null,
    blobPhotoUrl: null,
  },
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
  primeMinister: {
    slug: "denis-quart",
    fullName: "Denis Quart",
    gender: "M",
    photoUrl: null,
    blobPhotoUrl: null,
  },
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

/** Same data behind both readers; the per-government one returns its own functions and people. */
function setData(all: { episodes: GovernmentEpisode[]; people: Record<string, PersonCard> }) {
  vi.mocked(getGovernmentEpisodes).mockResolvedValue(all);
  vi.mocked(getGovernmentEpisodesFor).mockImplementation(async (id) => {
    const own = all.episodes.filter((e) => e.governmentId === id);
    const ids = new Set(own.map((e) => e.politicianId));
    return {
      episodes: own,
      people: Object.fromEntries(Object.entries(all.people).filter(([pid]) => ids.has(pid))),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(getPublishedGovernments).mockResolvedValue(GOVS);
  setData({ episodes, people });
  vi.mocked(getGovernmentMemberAffairs).mockResolvedValue({
    "karim-public": { definitive: 1, nonDefinitive: 0, ongoing: 2 },
    "pascal-sortant": { definitive: 0, nonDefinitive: 0, ongoing: 1 },
  });
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
  it("ne lit que son gouvernement et renvoie vers sa présidence", async () => {
    const markup = await html(detail("gouvernement-a"));
    expect(getGovernmentEpisodes).not.toHaveBeenCalled();
    expect(vi.mocked(getGovernmentEpisodesFor).mock.calls).toEqual([["ga"]]);
    expect(markup).toContain('href="/politiques/gouvernements#presidence-macron"');
    expect(text(markup)).toContain("Présidence d'Emmanuel Macron");
  });

  it("nomme le gouvernement voisin sans répéter « Gouvernement »", async () => {
    const markup = await html(detail("gouvernement-b"));
    const div = document.createElement("div");
    div.innerHTML = markup;
    const prev = div.querySelector('a[href="/politiques/gouvernements/gouvernement-a"]');
    const next = div.querySelector('a[href="/politiques/gouvernements/gouvernement-c"]');
    // The accessible name comes from the visible text, so both must read the same.
    expect(prev?.hasAttribute("aria-label")).toBe(false);
    expect(next?.hasAttribute("aria-label")).toBe(false);
    expect(prev?.textContent).toBe("Précédent Gouvernement Alpha");
    expect(next?.textContent).toBe("Suivant Gouvernement Charlie");
    expect(text(markup)).not.toMatch(/Gouvernement (précédent|suivant) :/);
  });

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

  it("ne révèle pas l'intitulé d'une fonction d'une personne cachée dans les changements", async () => {
    setData({
      episodes: [
        ...episodes,
        ep({
          governmentId: "gb",
          politicianId: "cache-cache",
          title: "Ministre secrète des Mystères",
          start: "2024-04-01",
          startEvidence: "ACT",
          end: "2024-05-01",
          endEvidence: "ACT",
        }),
      ],
      people,
    });
    const t = text(await html(detail("gouvernement-b")));
    expect(t).toContain("Changement non détaillé");
    expect(t).not.toContain("Mystères");
    expect(t).not.toContain("Ministre cachée");
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

describe("changements documentés", () => {
  const act = (n: number, signedAt: string) => ({
    label: `Décret n° ${n} relatif à la composition du Gouvernement`,
    url: `https://www.legifrance.gouv.fr/jorf/id/JORFTEXT00000000${n}`,
    signedAt,
    effectiveAt: null,
    journalPublishedAt: signedAt,
    journalNumber: null,
    jorfId: null,
  });
  const extra = {
    "lea-une": person("lea-une", "Léa Une", "published", "F"),
    "marc-deux": person("marc-deux", "Marc Deux", "published"),
  };

  async function section(slug: string) {
    const { container } = render(await detail(slug));
    const el = container.querySelector("#changements")!;
    const outside = [...el.children].map((c) => c.cloneNode(true) as Element);
    outside.forEach((c) => c.querySelectorAll("details").forEach((d) => d.remove()));
    return {
      all: (el.textContent ?? "").replace(/\s+/g, " "),
      visible: outside
        .map((c) => c.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " "),
      details: el.querySelector("details"),
    };
  }

  it("cite une seule fois l'acte commun à deux changements du même jour", async () => {
    const decree = act(1, "2023-03-01");
    setData({
      episodes: [
        ...episodes,
        ...["lea-une", "marc-deux"].map((politicianId) =>
          ep({
            governmentId: "ga",
            politicianId,
            title: `Secrétaire d'État ${politicianId}`,
            start: "2023-03-01",
            startEvidence: "ACT",
            startSourceUrl: decree.url,
            startAct: decree,
            end: "2024-01-08",
            endEvidence: "ACT",
          })
        ),
      ],
      people: { ...people, ...extra },
    });
    const { all } = await section("gouvernement-a");
    expect(all).toContain("Léa Une entre au gouvernement");
    expect(all).toContain("Marc Deux entre au gouvernement");
    expect(all.split(decree.label)).toHaveLength(2);
    expect(all.split("signé le 1er mars 2023").length).toBeLessThanOrEqual(2);
  });

  it("garde la preuve de chaque changement sans acte", async () => {
    setData({
      episodes: [
        ...episodes,
        ...["lea-une", "marc-deux"].map((politicianId) =>
          ep({
            governmentId: "ga",
            politicianId,
            title: `Secrétaire d'État ${politicianId}`,
            start: "2023-05-02",
            startEvidence: "DATASET",
            end: "2024-01-08",
            endEvidence: "ACT",
          })
        ),
      ],
      people: { ...people, ...extra },
    });
    const { all } = await section("gouvernement-a");
    expect(all).toContain("Léa Une entre au gouvernement");
    expect(all).toContain("Marc Deux entre au gouvernement");
    // Deux entrées du 2 mai et la transition du 4 juillet : trois mentions, une par changement.
    expect(all.split("jeu de données").length - 1).toBe(3);
  });

  it("replie les changements les plus anciens au-delà de huit groupes", async () => {
    const dated = Array.from({ length: 10 }, (_, i) => {
      const day = `2023-0${Math.floor(i / 5) + 1}-${String((i % 5) * 5 + 2).padStart(2, "0")}`;
      const decree = act(i + 10, day);
      return ep({
        governmentId: "ga",
        politicianId: `p${i}`,
        title: `Fonction ${i}`,
        start: day,
        startEvidence: "ACT",
        startSourceUrl: decree.url,
        startAct: decree,
        end: "2024-01-08",
        endEvidence: "ACT",
      });
    });
    const morePeople = Object.fromEntries(
      dated.map((e, i) => [
        e.politicianId,
        person(e.politicianId, `Personne Numéro${i}`, "published"),
      ])
    );
    setData({ episodes: [...episodes, ...dated], people: { ...people, ...morePeople } });
    const { all, visible, details } = await section("gouvernement-a");
    expect(details).not.toBeNull();
    expect(details!.querySelector("summary")!.textContent).toMatch(
      /^Changements plus anciens \(\d+\)$/
    );
    // Le plus récent reste visible, le plus ancien est replié mais toujours dans la page.
    expect(visible).toContain("Personne Numéro9 entre au gouvernement");
    expect(visible).not.toContain("Personne Numéro0 entre au gouvernement");
    expect(all).toContain("Personne Numéro0 entre au gouvernement");
  });

  it("ne replie rien pour un gouvernement à faible rotation", async () => {
    const { details } = await section("gouvernement-a");
    expect(details).toBeNull();
  });

  it("lie la page Membres filtrée sur ce gouvernement", async () => {
    const { container } = render(await detail("gouvernement-a"));
    const link = container.querySelector(
      'a[href="/politiques/gouvernements/membres?gouvernement=gouvernement-a"]'
    );
    expect(link?.textContent).toContain("Membres de ce gouvernement");
    expect(link?.className).toContain("min-h-11");
  });
});

describe("composition par défaut", () => {
  const E = gov({
    id: "ge",
    slug: "gouvernement-e",
    name: "Gouvernement Echo",
    primeMinisterAppointedAt: "2024-09-05",
    formedAt: "2024-09-21",
    resignedAt: "2024-12-05",
    resignedEvidence: "ACT",
    endedAt: "2025-10-05",
    compositionVerifiedAt: "2025-10-05",
    currentAffairsAttested: false,
    primeMinister: {
      slug: "denis-quart",
      fullName: "Denis Quart",
      gender: "M",
      photoUrl: null,
      blobPhotoUrl: null,
    },
    participantCount: 1,
  });
  const resigned = ep({
    governmentId: "ge",
    politicianId: "denis-quart",
    type: "PREMIER_MINISTRE",
    title: "Premier ministre",
    start: "2024-09-21",
    end: "2024-12-05",
    endEvidence: "ACT",
    endKind: "COLLECTIVE_RESIGNATION",
  });

  function use(eps: GovernmentEpisode[]) {
    vi.mocked(getPublishedGovernments).mockResolvedValue([E]);
    setData({ episodes: eps, people });
  }

  it("ouvre à la date de démission et n'affiche aucune fausse absence", async () => {
    use([resigned]);
    const t = text(await html(detail("gouvernement-e")));
    expect(t).toContain("Dernière composition documentée, au");
    expect(t).toContain("1 personne présente de façon établie au 5 décembre 2024");
    expect(t).not.toContain("Absence établie");
  });

  it("à la fin d'une période non attestée : présence non établie, pas absence établie", async () => {
    use([resigned]);
    const t = text(await html(detail("gouvernement-e", { date: "2025-10-05" })));
    expect(t).toContain("Aucune présence établie au 5 octobre 2025");
    expect(t).toContain("Période à préciser");
    expect(t).not.toContain("Absence établie");
    // Régime non attesté : la dernière date est la nomination de l'équipe suivante.
    expect(t).toContain("5 octobre 2025 · Équipe suivante nommée");
    expect(t).not.toContain("affaires courantes");
  });

  it("garde « Absence établie » pour une composition réellement vide", async () => {
    use([]);
    const t = text(await html(detail("gouvernement-e", { date: "2025-10-05" })));
    expect(t).toContain("Absence établie");
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

  it("groupe par présidence, avec une ancre par présidence et un seul lien par carte", async () => {
    const H = gov({
      id: "gh",
      slug: "gouvernement-h",
      name: "Gouvernement Hôtel",
      sequence: 0,
      primeMinisterAppointedAt: "2016-12-06",
      formedAt: "2016-12-06",
      endedAt: "2017-05-15",
      compositionVerifiedAt: "2017-05-15",
    });
    vi.mocked(getPublishedGovernments).mockResolvedValue([H, ...GOVS]);
    const markup = await html(DirectoryPage({ searchParams: sp() }));
    const div = document.createElement("div");
    div.innerHTML = markup;
    const headings = [...div.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toEqual(["Présidence d'Emmanuel Macron", "Présidence de François Hollande"]);
    expect(markup).toContain('href="#presidence-hollande"');
    expect(div.querySelector("#presidence-hollande")?.textContent).toContain("Gouvernement Hôtel");
    for (const card of div.querySelectorAll("article")) {
      expect(card.querySelectorAll("a")).toHaveLength(1);
    }
    const t = text(markup);
    expect(t).toContain("Du 6 décembre 2016 au 15 mai 2017");
    expect(t).toContain("Du 21 septembre au 23 décembre 2024");
    expect(t).toContain("Équipe nommée le 12 octobre 2025");
    expect(t).not.toContain("Terminé");
    expect(t).not.toContain("Première ministre :");
    // Ancres en liste, retour vers elles en fin de section, filtre visible (deux présidences).
    expect(div.querySelectorAll('nav#presidences li a[href^="#presidence-"]')).toHaveLength(2);
    expect(div.querySelectorAll('a[href="#presidences"]')).toHaveLength(2);
    expect(div.querySelector("select#gouv-presidence")).not.toBeNull();
  });

  it("masque le filtre et les ancres tant qu'une seule présidence est publiée", async () => {
    const div = document.createElement("div");
    div.innerHTML = await html(DirectoryPage({ searchParams: sp() }));
    expect(div.querySelector("select#gouv-presidence")).toBeNull();
    expect(div.querySelector("nav#presidences")).toBeNull();
    expect(div.querySelector('a[href="#presidences"]')).toBeNull();
  });

  it("ne lit que les fonctions du gouvernement en exercice vérifié", async () => {
    const Dv = { ...D, compositionVerifiedAt: "2025-10-12" };
    vi.mocked(getPublishedGovernments).mockResolvedValue([A, B, C, Dv]);
    const t = text(await html(DirectoryPage({ searchParams: sp() })));
    expect(getGovernmentEpisodes).not.toHaveBeenCalled();
    expect(vi.mocked(getGovernmentEpisodesFor).mock.calls).toEqual([["gd"]]);
    expect(t).toContain("dont 1 présente à cette date");
  });

  it("n'écrit aucune période pour un gouvernement aux dates estimées", async () => {
    vi.mocked(getPublishedGovernments).mockResolvedValue([A, { ...B, hasDerivedDate: true }, C, D]);
    const div = document.createElement("div");
    div.innerHTML = await html(DirectoryPage({ searchParams: sp() }));
    const card = [...div.querySelectorAll("article")].find((a) =>
      a.textContent?.includes("Gouvernement Bravo")
    )!;
    expect(card.textContent).toContain("Dates estimées");
    expect(card.textContent).not.toMatch(/Du \d/);
  });

  it("filtre par présidence et ignore l'ancien paramètre année", async () => {
    const H = gov({
      id: "gh",
      slug: "gouvernement-h",
      name: "Gouvernement Hôtel",
      sequence: 0,
      primeMinisterAppointedAt: "2016-12-06",
      endedAt: "2017-05-15",
    });
    vi.mocked(getPublishedGovernments).mockResolvedValue([H, ...GOVS]);
    const t = text(await html(DirectoryPage({ searchParams: sp({ presidence: "hollande" }) })));
    expect(t).toContain("Gouvernement Hôtel");
    expect(t).not.toContain("Gouvernement Alpha");
    const all = text(await html(DirectoryPage({ searchParams: sp({ annee: "2016" }) })));
    expect(all).toContain("Gouvernement Alpha");
  });

  it("décrit la liste affichée en JSON-LD", async () => {
    const markup = await html(DirectoryPage({ searchParams: sp() }));
    const div = document.createElement("div");
    div.innerHTML = markup;
    const ld = JSON.parse(div.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.numberOfItems).toBe(GOVS.length);
    expect(ld.itemListElement[0]).toMatchObject({
      name: "Gouvernement Delta",
      url: expect.stringMatching(/\/politiques\/gouvernements\/gouvernement-d$/),
    });
  });

  it("montre la photo d'un Premier ministre publié et les initiales sinon", async () => {
    const photo = "https://upload.wikimedia.org/alix.jpg";
    vi.mocked(getPublishedGovernments).mockResolvedValue([
      { ...A, primeMinister: { ...A.primeMinister, blobPhotoUrl: photo } },
      B,
    ]);
    const div = document.createElement("div");
    div.innerHTML = await html(DirectoryPage({ searchParams: sp() }));
    const card = (name: string) =>
      [...div.querySelectorAll("article")].find((a) => a.textContent?.includes(name))!;

    const alpha = card("Gouvernement Alpha");
    const img = alpha.querySelector("img");
    expect(img?.getAttribute("src")).toBe(photo);
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(alpha.querySelectorAll("a")).toHaveLength(1);

    // B : fiche non publiée, le mapping a mis la photo à null, seules les initiales restent.
    const bravo = card("Gouvernement Bravo");
    expect(bravo.querySelector("img")).toBeNull();
    expect(bravo.querySelector('[aria-hidden="true"]')?.textContent).toBe("BS");
  });

  it("filtre par nom sans tenir compte des accents", async () => {
    const t = text(await html(DirectoryPage({ searchParams: sp({ q: "chloe" }) })));
    expect(t).toContain("Gouvernement Charlie");
    expect(t).not.toContain("Gouvernement Alpha");
  });
});

describe("membres", () => {
  it("n'affiche aucune affaire sans le filtre", async () => {
    const t = text(await html(MembersPage({ searchParams: sp() })));
    expect(t).not.toContain("1 condamnation définitive");
    expect(t).not.toContain("procédures en cours");
    expect(t).not.toContain("Voir les affaires");
    expect(t).not.toContain("présumée innocente");
  });

  it("filtre par affaires en distinguant condamnation et procédure en cours", async () => {
    const all = text(await html(MembersPage({ searchParams: sp({ affaires: "toutes" }) })));
    expect(all).toContain("Karim Public");
    expect(all).toContain("Pascal Sortant");
    expect(all).not.toContain("Inès Entrante");
    expect(all).toContain("1 condamnation définitive");
    expect(all).toContain("2 procédures en cours");
    expect(all).toContain("présumée innocente");

    const convicted = text(
      await html(MembersPage({ searchParams: sp({ affaires: "condamnation" }) }))
    );
    expect(convicted).toContain("Karim Public");
    expect(convicted).not.toContain("Pascal Sortant");
  });

  it("lie les fiches publiées, jamais les fiches en attente ni cachées", async () => {
    const markup = await html(MembersPage({ searchParams: sp() }));
    expect(markup).toContain('href="/politiques/karim-public"');
    expect(markup).not.toContain('href="/politiques/noemie-attente"');
    expect(text(markup)).toContain("Noémie Attente");
    expect(text(markup)).not.toContain("Cécile Cachée");
    expect(text(markup).toLowerCase()).not.toContain("depuis");
  });

  it("qualifie « au moins » l'effectif présent quand la couverture est partielle", async () => {
    const t = text(
      await html(MembersPage({ searchParams: sp({ mode: "present", au: "2024-03-01" }) }))
    );
    expect(t).toMatch(/au moins \d+ personnes? présentes?/);
  });

  it("ne qualifie pas « au moins » si le gouvernement filtré est complet", async () => {
    const t = text(
      await html(
        MembersPage({
          searchParams: sp({ mode: "present", au: "2023-06-01", gouvernement: "gouvernement-a" }),
        })
      )
    );
    expect(t).toMatch(/\d+ personnes? présentes?/);
    expect(t).not.toContain("au moins");
  });

  it("filtre par présidence de nomination, pas par chevauchement de dates", async () => {
    // Gouvernement Hôtel : nommé sous Hollande, terminé après l'investiture de Macron.
    const H = gov({
      id: "gh",
      slug: "gouvernement-h",
      name: "Gouvernement Hôtel",
      sequence: 0,
      primeMinisterAppointedAt: "2016-12-06",
      formedAt: "2016-12-06",
      endedAt: "2017-05-15",
      compositionVerifiedAt: "2017-05-15",
    });
    vi.mocked(getPublishedGovernments).mockResolvedValue([H, ...GOVS]);
    setData({
      episodes: [
        ...episodes,
        ep({
          governmentId: "gh",
          politicianId: "karim-public",
          title: "Ministre de l'Intérieur",
          start: "2016-12-06",
          end: "2017-05-15",
          endEvidence: "ACT",
        }),
      ],
      people,
    });
    const markup = await html(
      MembersPage({
        searchParams: sp({
          fonction: "ministre",
          gouvernement: "gouvernement-a",
          du: "2017-01-01",
        }),
      })
    );
    const div = document.createElement("div");
    div.innerHTML = markup;
    expect(div.textContent).toContain("Présidences :");
    const links = [...div.querySelectorAll("a")];
    const hollande = links.find((a) => a.textContent === "François Hollande");
    // Retire gouvernement, du et au ; garde les autres filtres.
    expect(hollande?.getAttribute("href")).toBe(
      "/politiques/gouvernements/membres?presidence=hollande&fonction=ministre"
    );

    const macron = text(await html(MembersPage({ searchParams: sp({ presidence: "macron" }) })));
    expect(macron).toContain("Présidence : Emmanuel Macron");
    expect(macron).toContain("Emmanuel Macron (filtre appliqué)");
    // Karim Public a aussi une fonction dans le gouvernement Hôtel : seule celle de Macron reste.
    expect(macron).toContain("Ministre de l'Économie");
    expect(macron).not.toContain("Ministre de l'Intérieur");

    const hollandeOnly = text(
      await html(MembersPage({ searchParams: sp({ presidence: "hollande" }) }))
    );
    expect(hollandeOnly).toContain("Ministre de l'Intérieur");
    expect(hollandeOnly).not.toContain("Inès Entrante");
  });

  it("résume la période couverte par la présidence filtrée, pas toute la couverture", async () => {
    const H = gov({
      id: "gh",
      slug: "gouvernement-h",
      name: "Gouvernement Hôtel",
      sequence: 0,
      primeMinisterAppointedAt: "2016-12-06",
      formedAt: "2016-12-06",
      endedAt: "2017-05-15",
      compositionVerifiedAt: "2017-05-15",
    });
    vi.mocked(getPublishedGovernments).mockResolvedValue([H, ...GOVS]);
    const dates = (markup: string) => {
      const div = document.createElement("div");
      div.innerHTML = markup;
      return [
        div.querySelector<HTMLInputElement>("#membres-du")?.getAttribute("value"),
        div.querySelector<HTMLInputElement>("#membres-au")?.getAttribute("value"),
      ];
    };

    const all = await html(MembersPage({ searchParams: sp() }));
    expect(text(all)).toContain("entre le 6 décembre 2016 et le 23 décembre 2024");
    expect(dates(all)).toEqual(["2016-12-06", "2024-12-23"]);

    const hollande = await html(MembersPage({ searchParams: sp({ presidence: "hollande" }) }));
    expect(text(hollande)).toContain("entre le 6 décembre 2016 et le 15 mai 2017");
    expect(dates(hollande)).toEqual(["2016-12-06", "2017-05-15"]);

    const macron = await html(MembersPage({ searchParams: sp({ presidence: "macron" }) }));
    expect(text(macron)).toContain("entre le 20 mai 2022 et le 23 décembre 2024");
    expect(dates(macron)).toEqual(["2022-05-20", "2024-12-23"]);

    // Une période choisie plus étroite que la présidence reste celle affichée.
    const narrow = await html(
      MembersPage({
        searchParams: sp({ presidence: "macron", du: "2023-01-01", au: "2023-06-30" }),
      })
    );
    expect(text(narrow)).toContain("entre le 1er janvier 2023 et le 30 juin 2023");
  });

  it("n'affiche pas de raccourci quand une seule présidence est couverte", async () => {
    const t = text(await html(MembersPage({ searchParams: sp() })));
    expect(t).not.toContain("Présidences :");
  });

  it("distingue l'ancien ministre sans fiche du brouillon, années comprises", async () => {
    const ancien: PersonCard = {
      ...person("henri-rey", "Henri Rey", "pending"),
      pendingReason: "ageExcluded",
      lifespan: "1903-1985",
    };
    setData({
      episodes: [
        ...episodes,
        ep({ governmentId: "ga", politicianId: "henri-rey", title: "Ministre d'État" }),
        // Brouillon dont la seule fonction commence sur une date du jeu de données.
        ep({
          governmentId: "gb",
          politicianId: "noemie-attente",
          title: "Ministre déléguée",
          start: "2024-01-09",
          startEvidence: "DATASET",
        }),
      ],
      people: { ...people, "henri-rey": ancien },
    });
    const div = document.createElement("div");
    div.innerHTML = await html(MembersPage({ searchParams: sp({ q: "rey" }) }));
    expect(div.textContent).toContain("Henri Rey (1903-1985)");
    expect(div.textContent).toContain("Pas de fiche détaillée sur Poligraph.");
    expect(div.textContent).not.toContain("vérifiées");
    expect(div.querySelector('a[href="/politiques/henri-rey"]')).toBeNull();

    const draft = text(
      await html(MembersPage({ searchParams: sp({ q: "noemie", gouvernement: "gouvernement-b" }) }))
    );
    expect(draft).toContain("Profil public en cours de constitution.");
    expect(draft).not.toContain("vérifiées");
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
    setData({
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
