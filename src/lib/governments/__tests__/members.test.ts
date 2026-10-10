import { describe, expect, it, vi } from "vitest";

// `normalizeText` vit dans name-matching.ts, qui importe le client Prisma.
vi.mock("@/lib/db", () => ({ db: {} }));

import { filterMembers, membersCoverage, type MembersData } from "../members";
import type { GovernmentEpisode, PersonCard } from "../mapping";
import type { MembersQuery } from "../params";
import type { GovernmentDates } from "../types";

// --- Fixtures ---------------------------------------------------------------

function gov(id: string, overrides: Partial<GovernmentDates> = {}): GovernmentDates {
  return {
    id,
    slug: `slug-${id}`,
    primeMinisterAppointedAt: "2016-01-01",
    formedAt: "2016-01-02",
    resignedAt: "2017-12-31",
    resignedEvidence: "ACT",
    endedAt: "2018-01-01",
    compositionVerifiedAt: null,
    currentAffairsAttested: false,
    hasDerivedDate: false,
    ...overrides,
  };
}

function ep(
  membershipId: string,
  politicianId: string,
  overrides: Partial<GovernmentEpisode> = {}
): GovernmentEpisode {
  return {
    membershipId,
    mandateId: `m-${membershipId}`,
    mandatePublicId: null,
    governmentId: "g1",
    politicianId,
    type: "MINISTRE",
    title: `Ministre ${membershipId}`,
    start: "2016-01-02",
    startEvidence: "ACT",
    startSourceUrl: null,
    end: "2017-12-31",
    endEvidence: "ACT",
    endSourceUrl: null,
    endKind: "INDIVIDUAL",
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
  lastName: string,
  visibility: PersonCard["visibility"] = "published"
): PersonCard {
  return {
    id,
    publicId: null,
    slug: normalizeSlug(fullName),
    fullName,
    lastName,
    gender: null,
    photoUrl: null,
    blobPhotoUrl: null,
    visibility,
  };
}

function normalizeSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function query(overrides: Partial<MembersQuery> = {}): MembersQuery {
  return {
    mode: "periode",
    du: "2016-01-02",
    au: "2018-01-01",
    gouvernement: null,
    fonction: null,
    affaires: null,
    q: "",
    personne: null,
    page: 1,
    ...overrides,
  };
}

function okResult(result: ReturnType<typeof filterMembers>) {
  if (result.status !== "ok") throw new Error(`statut inattendu : ${result.status}`);
  return result;
}

const g1 = gov("g1");
const people: Record<string, PersonCard> = {
  pA: person("pA", "Amélie Oudéa-Castéra", "Oudéa-Castéra"),
  pB: person("pB", "Bruno Le Maire", "Le Maire"),
  pC: person("pC", "Claire Cachée", "Cachée", "hidden"),
  pD: person("pD", "Denis Attente", "Attente", "pending"),
};

// --- Tests ------------------------------------------------------------------

describe("filterMembers, mode période", () => {
  it("une personne avec trois fonctions donne une seule ligne", () => {
    const data: MembersData = {
      episodes: [
        ep("b1", "pB", { end: "2016-06-01" }),
        ep("b2", "pB", { start: "2016-06-01", end: "2017-01-01", type: "MINISTRE_DELEGUE" }),
        ep("b3", "pB", { start: "2017-01-01" }),
      ],
      people,
    };
    const result = okResult(filterMembers([g1], data, query()));
    expect(result.persons).toHaveLength(1);
    expect(result.persons[0]!.person.id).toBe("pB");
    expect(result.persons[0]!.functions.map((f) => f.episode.membershipId)).toEqual([
      "b1",
      "b2",
      "b3",
    ]);
    expect(result.episodeCount).toBe(3);
    expect(result.establishedCount).toBe(1);
  });

  it("une personne cachée n'apparaît pas ; une fiche en attente apparaît", () => {
    const data: MembersData = {
      episodes: [ep("c1", "pC"), ep("d1", "pD"), ep("x1", "inconnu")],
      people,
    };
    const result = okResult(filterMembers([g1], data, query()));
    expect(result.persons.map((p) => p.person.id)).toEqual(["pD"]);
    expect(result.persons[0]!.person.visibility).toBe("pending");
    expect(result.episodeCount).toBe(1);
  });

  it("du=2017-05-15 inclut une fonction commencée avant et poursuivie après", () => {
    const data: MembersData = {
      episodes: [ep("b1", "pB", { start: "2016-03-01", end: "2017-12-01" })],
      people,
    };
    const result = okResult(
      filterMembers([g1], data, query({ du: "2017-05-15", au: "2017-06-30" }))
    );
    expect(result.persons.map((p) => p.person.id)).toEqual(["pB"]);
    expect(result.persons[0]!.status).toBe("established");
  });

  it("exclut une fonction terminée avant la période", () => {
    const data: MembersData = {
      episodes: [ep("b1", "pB", { end: "2017-05-14" })],
      people,
    };
    const result = okResult(filterMembers([g1], data, query({ du: "2017-05-15" })));
    expect(result.persons).toEqual([]);
  });

  it("la recherche « oudea castera » trouve Amélie Oudéa-Castéra", () => {
    const data: MembersData = {
      episodes: [ep("a1", "pA"), ep("b1", "pB")],
      people,
    };
    const result = okResult(filterMembers([g1], data, query({ q: "oudea castera" })));
    expect(result.persons.map((p) => p.person.fullName)).toEqual(["Amélie Oudéa-Castéra"]);
    // Casse, accents et tirets indifférents, recherche aussi dans le slug.
    for (const q of ["OUDÉA-CASTÉRA", "Amélie", "amelie-oudea"]) {
      expect(okResult(filterMembers([g1], data, query({ q }))).persons).toHaveLength(1);
    }
  });

  it("trie par nom de famille normalisé", () => {
    const data: MembersData = {
      episodes: [ep("b1", "pB"), ep("a1", "pA"), ep("d1", "pD")],
      people,
    };
    const result = okResult(filterMembers([g1], data, query()));
    expect(result.persons.map((p) => p.person.lastName)).toEqual([
      "Attente",
      "Le Maire",
      "Oudéa-Castéra",
    ]);
  });

  it("filtre par fonction et par gouvernement", () => {
    const g2 = gov("g2", { slug: "autre" });
    const data: MembersData = {
      episodes: [
        ep("a1", "pA", { type: "SECRETAIRE_ETAT" }),
        ep("b1", "pB"),
        ep("b2", "pB", { governmentId: "g2", type: "SECRETAIRE_ETAT" }),
      ],
      people,
    };
    const bySecretary = okResult(filterMembers([g1, g2], data, query({ fonction: "secretaire" })));
    expect(bySecretary.persons.map((p) => p.person.id)).toEqual(["pB", "pA"]);
    expect(bySecretary.episodeCount).toBe(2);

    const byGov = okResult(filterMembers([g1, g2], data, query({ gouvernement: "autre" })));
    expect(byGov.persons.map((p) => p.person.id)).toEqual(["pB"]);
    expect(byGov.persons[0]!.functions.map((f) => f.episode.membershipId)).toEqual(["b2"]);
  });

  it("filtre par affaires sans rien changer sans le filtre", () => {
    const data: MembersData = { episodes: [ep("a1", "pA"), ep("b1", "pB")], people };
    const affairs = { pB: { definitive: 0, nonDefinitive: 1, ongoing: 0 } };
    const all = okResult(filterMembers([g1], data, query(), affairs));
    expect(all.persons.map((p) => p.person.id)).toEqual(["pB", "pA"]);
    const convicted = okResult(
      filterMembers([g1], data, query({ affaires: "condamnation" }), affairs)
    );
    expect(convicted.persons.map((p) => p.person.id)).toEqual(["pB"]);
    const definitive = okResult(
      filterMembers([g1], data, query({ affaires: "condamnation-definitive" }), affairs)
    );
    expect(definitive.persons).toEqual([]);
  });

  it("compte à part les personnes dont la présence est à préciser", () => {
    const data: MembersData = {
      // Fin inconnue, jamais confirmée : seul le jour de nomination est établi.
      episodes: [ep("a1", "pA", { end: null, endKind: null, endEvidence: null }), ep("b1", "pB")],
      people,
    };
    const result = okResult(filterMembers([g1], data, query({ du: "2017-01-01" })));
    expect(result.establishedCount).toBe(1);
    expect(result.undocumentedCount).toBe(1);
    expect(result.persons.find((p) => p.person.id === "pA")?.status).toBe("undocumented");
  });

  it("n'établit rien au-delà de la composition documentée", () => {
    // Gouvernement en exercice documenté jusqu'au 2026-09-01. Une nomination par acte du
    // 2026-09-15, sans confirmation, est établie le jour même selon la règle 3, mais ce jour est
    // hors de la période consultable : la fonction reste « à préciser ».
    const current = gov("g3", {
      formedAt: "2026-01-01",
      primeMinisterAppointedAt: "2026-01-01",
      resignedAt: null,
      resignedEvidence: null,
      endedAt: null,
      compositionVerifiedAt: "2026-09-01",
    });
    const data: MembersData = {
      episodes: [
        ep("a1", "pA", {
          governmentId: "g3",
          start: "2026-09-15",
          end: null,
          endEvidence: null,
          endKind: null,
        }),
      ],
      people,
    };
    const result = okResult(
      filterMembers([current], data, query({ du: "2026-09-01", au: "2026-10-01" }))
    );
    expect(result.persons.map((p) => p.status)).toEqual(["undocumented"]);
    expect(result.establishedCount).toBe(0);
  });
});

describe("filterMembers, mode présents au", () => {
  it("lit la date `au` et suit compositionAt", () => {
    const data: MembersData = {
      episodes: [ep("a1", "pA", { end: "2016-06-01" }), ep("b1", "pB")],
      people,
    };
    const result = okResult(
      filterMembers([g1], data, query({ mode: "present", au: "2016-07-01" }))
    );
    expect(result.persons.map((p) => p.person.id)).toEqual(["pB"]);
    expect(result.persons[0]!.functions[0]!.status).toBe("established");
  });

  it("une transition est signalée à part, hors effectif établi", () => {
    const D = "2016-06-01";
    const data: MembersData = {
      episodes: [ep("a1", "pA", { end: D, endEvidence: "DATASET" }), ep("b1", "pB", { start: D })],
      people,
    };
    const result = okResult(filterMembers([g1], data, query({ mode: "present", au: D })));
    expect(result.persons.map((p) => p.status)).toEqual(["transition", "transition"]);
    expect(result.establishedCount).toBe(0);
  });

  it("une date hors de toute période consultable donne « non établie »", () => {
    const data: MembersData = { episodes: [ep("b1", "pB")], people };
    expect(filterMembers([g1], data, query({ mode: "present", au: "2019-01-01" }))).toEqual({
      status: "not_established",
    });
  });

  it("les transitions tiennent compte des personnes cachées", () => {
    // La sortie d'une personne cachée le même jour reste une sortie pour la règle 4.
    const D = "2016-06-01";
    const data: MembersData = {
      episodes: [ep("c1", "pC", { end: D, endEvidence: "DATASET" }), ep("b1", "pB", { start: D })],
      people,
    };
    const result = okResult(filterMembers([g1], data, query({ mode: "present", au: D })));
    expect(result.persons.map((p) => [p.person.id, p.status])).toEqual([["pB", "transition"]]);
  });
});

describe("membersCoverage", () => {
  it("couvre de la première formation à la dernière date consultable", () => {
    const current = gov("g3", {
      formedAt: "2026-01-01",
      endedAt: null,
      compositionVerifiedAt: "2026-09-01",
    });
    const unverified = gov("g4", { formedAt: "2026-10-01", endedAt: null });
    expect(membersCoverage([current, g1, unverified])).toEqual({
      from: "2016-01-02",
      to: "2026-09-01",
    });
    expect(membersCoverage([unverified])).toBeNull();
  });
});

describe("filterMembers, filtre exact par personne", () => {
  const homonyms: Record<string, PersonCard> = {
    pJ: person("pJ", "Jean Martin", "Martin"),
    pK: person("pK", "Jean Martin Dupont", "Dupont"),
  };
  const data: MembersData = { episodes: [ep("j1", "pJ"), ep("k1", "pK")], people: homonyms };

  it("jean-martin ne ramène pas jean-martin-dupont", () => {
    const result = okResult(filterMembers([g1], data, query({ personne: "jean-martin" })));
    expect(result.persons.map((p) => p.person.slug)).toEqual(["jean-martin"]);
  });

  it("la recherche q, elle, ramène les deux (raison du filtre exact)", () => {
    const result = okResult(filterMembers([g1], data, query({ q: "jean-martin" })));
    expect(result.persons).toHaveLength(2);
  });
});
