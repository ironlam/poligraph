import { describe, it, expect } from "vitest";
import {
  EXPECTED_SENATE_COMPOSITION,
  EXPECTED_SEATS_AT_STAKE,
  EXPECTED_TOTAL_SEATS,
  summariseOutgoingMajority,
  verifyComposition,
} from "../outgoing-composition";
import type { OutgoingSenateComposition, OutgoingSenateSeat } from "@/types/stats-snapshots";

/**
 * The capture happens once and can never be redone, so these invariants run before the
 * write, not after. A capture that passes them is trustworthy; one that fails must
 * leave the database untouched.
 *
 * The fixture is built from `EXPECTED_SENATE_COMPOSITION` itself, so a test cannot
 * drift from the reference data it checks: change a group's seats in one place and the
 * fixture follows.
 */

const GROUP_NAMES: Record<string, string> = {
  LR: "Les Républicains",
  SER: "Socialiste, Écologiste et Républicain",
  UC: "Union Centriste",
  LIRT: "Les Indépendants - République et Territoires",
  RDPI: "Rassemblement des démocrates, progressistes et indépendants",
  "CRCE-K": "Communiste, Républicain, Citoyen et Écologiste - Kanaky",
  RDSE: "Rassemblement Démocratique et Social Européen",
  GEST: "Écologiste - Solidarité et Territoires",
  NI: "Non-inscrits",
};

function validComposition(): OutgoingSenateComposition {
  const seats: OutgoingSenateSeat[] = [];
  let index = 0;
  for (const [code, expected] of Object.entries(EXPECTED_SENATE_COMPOSITION)) {
    for (let i = 0; i < expected.atStake; i++) {
      seats.push({
        politicianId: `pol_${index}`,
        fullName: `Sénateur ${index}`,
        slug: `senateur-${index}`,
        departmentCode: "33",
        constituency: "Gironde",
        series: 2,
        groupCode: code,
        groupName: GROUP_NAMES[code] ?? code,
        groupShortName: code,
      });
      index++;
    }
  }

  return {
    capturedAt: "2026-08-10T09:47:26.080Z",
    totalSeats: EXPECTED_TOTAL_SEATS,
    seatsAtStake: EXPECTED_SEATS_AT_STAKE,
    seats,
    groups: Object.entries(EXPECTED_SENATE_COMPOSITION).map(([code, expected]) => ({
      groupCode: code,
      groupName: GROUP_NAMES[code] ?? code,
      shortName: code,
      held: expected.held,
      atStake: expected.atStake,
    })),
  };
}

describe("EXPECTED_SENATE_COMPOSITION", () => {
  it("couvre les neuf groupes du Sénat", () => {
    expect(Object.keys(EXPECTED_SENATE_COMPOSITION)).toHaveLength(9);
  });

  it("somme exactement à 348 sièges détenus et 178 remis en jeu", () => {
    const values = Object.values(EXPECTED_SENATE_COMPOSITION);
    expect(values.reduce((s, g) => s + g.held, 0)).toBe(EXPECTED_TOTAL_SEATS);
    expect(values.reduce((s, g) => s + g.atStake, 0)).toBe(EXPECTED_SEATS_AT_STAKE);
  });

  it("reproduit les chiffres publiés pour ce renouvellement", () => {
    expect(EXPECTED_SENATE_COMPOSITION.LR).toEqual({ held: 131, atStake: 77 });
    expect(EXPECTED_SENATE_COMPOSITION["CRCE-K"]).toEqual({ held: 18, atStake: 4 });
    const majority = ["LR", "UC"].map((c) => EXPECTED_SENATE_COMPOSITION[c]!);
    expect(majority.reduce((s, g) => s + g.held, 0)).toBe(190);
    expect(majority.reduce((s, g) => s + g.atStake, 0)).toBe(107);
  });

  /**
   * Régression sur l'invariant lui-même. Une version antérieure dérivait la majorité
   * sortante comme « les deux groupes détenant le plus de sièges ». C'est faux : le
   * deuxième par sièges détenus est SER avec 64, la majorité passe par UC avec 59, donc
   * la somme par rang donne 195 et non 190. Elle coïncidait sur les sièges remis en jeu
   * parce que SER et UC en ont 30 chacun, ce qui est exactement ainsi qu'un invariant
   * faux passe une relecture.
   */
  it("ne se laisse pas dériver du classement par sièges détenus", () => {
    const byHeld = Object.values(EXPECTED_SENATE_COMPOSITION).sort((a, b) => b.held - a.held);
    const topTwo = byHeld.slice(0, 2);
    expect(topTwo.reduce((s, g) => s + g.held, 0)).toBe(195);
    expect(topTwo.reduce((s, g) => s + g.held, 0)).not.toBe(190);
    // Et le piège : la somme des sièges remis en jeu coïncide malgré tout.
    expect(topTwo.reduce((s, g) => s + g.atStake, 0)).toBe(107);
  });
});

describe("verifyComposition : capture conforme", () => {
  it("ne signale rien sur une capture conforme", () => {
    expect(verifyComposition(validComposition())).toEqual([]);
  });
});

describe("verifyComposition : totaux et sièges", () => {
  it("refuse un total de sièges inattendu", () => {
    const c = { ...validComposition(), totalSeats: 351 };
    expect(verifyComposition(c).some((p) => p.includes("total des sièges"))).toBe(true);
  });

  it("refuse un nombre de sièges remis en jeu inattendu", () => {
    const c = { ...validComposition(), seatsAtStake: 176 };
    expect(verifyComposition(c).some((p) => p.includes("sièges remis en jeu : 176"))).toBe(true);
  });

  it("refuse une liste de sièges incomplète", () => {
    const c = validComposition();
    c.seats = c.seats.slice(0, 177);
    expect(verifyComposition(c).some((p) => p.includes("sièges capturés"))).toBe(true);
  });

  // Capturer un siège de série 1 signifierait que la requête ne filtre pas ce qu'on croit.
  it("refuse un siège hors de la série renouvelée", () => {
    const c = validComposition();
    c.seats[0] = { ...c.seats[0]!, series: 1 };
    expect(verifyComposition(c).some((p) => p.includes("hors de la série renouvelée"))).toBe(true);
  });

  it("refuse un sénateur capturé deux fois", () => {
    const c = validComposition();
    c.seats[1] = { ...c.seats[0]! };
    expect(verifyComposition(c).some((p) => p.includes("deux fois"))).toBe(true);
  });

  it("refuse un siège sans identifiant ou sans nom", () => {
    const c = validComposition();
    c.seats[5] = { ...c.seats[5]!, politicianId: "" };
    expect(verifyComposition(c).some((p) => p.includes("sans identifiant"))).toBe(true);
  });

  it("refuse un siège sans code de groupe", () => {
    const c = validComposition();
    c.seats[7] = { ...c.seats[7]!, groupCode: null };
    expect(verifyComposition(c).some((p) => p.includes("sans code de groupe"))).toBe(true);
  });
});

/**
 * Validation exhaustive et symétrique : les neuf groupes sont vérifiés de la même
 * manière, dans les deux sens. Aucun groupe attendu ne peut manquer, aucun groupe
 * inattendu ne peut passer. Une empreinte anonyme laissait six groupes sans contrôle
 * et survivait à une permutation d'identité entre deux groupes aux mêmes nombres.
 */
describe("verifyComposition : agrégat par code de groupe", () => {
  it("refuse un groupe attendu absent", () => {
    const c = validComposition();
    c.groups = c.groups.filter((g) => g.groupCode !== "UC");
    expect(verifyComposition(c).some((p) => p.includes("groupe UC absent"))).toBe(true);
  });

  it("refuse un groupe inattendu", () => {
    const c = validComposition();
    c.groups.push({
      groupCode: "XXX",
      groupName: "Groupe fantôme",
      shortName: null,
      held: 0,
      atStake: 0,
    });
    expect(verifyComposition(c).some((p) => p.includes("groupe XXX inattendu"))).toBe(true);
  });

  it("refuse un groupe présent deux fois", () => {
    const c = validComposition();
    c.groups.push({ ...c.groups[0]! });
    expect(verifyComposition(c).some((p) => p.includes("deux fois dans l'agrégat"))).toBe(true);
  });

  it("refuse des nombres qui ne correspondent pas au code", () => {
    const c = validComposition();
    c.groups = c.groups.map((g) => (g.groupCode === "LR" ? { ...g, atStake: 76 } : g));
    expect(verifyComposition(c).some((p) => p.includes("groupe LR : 76 sur 131"))).toBe(true);
  });

  // Le piège que l'empreinte anonyme ne voyait pas : deux groupes aux mêmes nombres
  // échangés. SER et UC ont tous deux 30 sièges remis en jeu.
  it("refuse une permutation d'identité entre deux groupes aux mêmes sièges remis en jeu", () => {
    const c = validComposition();
    c.groups = c.groups.map((g) => {
      if (g.groupCode === "SER") return { ...g, held: 59 };
      if (g.groupCode === "UC") return { ...g, held: 64 };
      return g;
    });
    const problems = verifyComposition(c);
    expect(problems.some((p) => p.includes("groupe SER"))).toBe(true);
    expect(problems.some((p) => p.includes("groupe UC"))).toBe(true);
  });
});

describe("verifyComposition : cohérence entre lignes et agrégat", () => {
  it("refuse un agrégat qui annonce plus de sièges que ceux capturés", () => {
    const c = validComposition();
    // Un siège LR reversé à UC dans les lignes, agrégat inchangé.
    c.seats[0] = { ...c.seats[0]!, groupCode: "UC", groupName: GROUP_NAMES.UC! };
    const problems = verifyComposition(c);
    expect(problems.some((p) => p.includes("groupe LR : 76 siège(s) capturé(s)"))).toBe(true);
    expect(problems.some((p) => p.includes("groupe UC : 31 siège(s) capturé(s)"))).toBe(true);
  });

  it("refuse un groupe annonçant des sièges dont aucun n'est capturé", () => {
    const c = validComposition();
    c.seats = c.seats.filter((s) => s.groupCode !== "NI");
    c.seats.push({ ...c.seats[0]!, politicianId: "pol_extra", slug: "extra" });
    expect(verifyComposition(c).some((p) => p.includes("groupe NI annonce 1 siège(s)"))).toBe(true);
  });

  it("accumule tous les problèmes plutôt que de s'arrêter au premier", () => {
    const c = { ...validComposition(), totalSeats: 300, seatsAtStake: 100 };
    c.seats[0] = { ...c.seats[0]!, series: 1, politicianId: "" };
    c.groups = c.groups.filter((g) => g.groupCode !== "NI");
    const problems = verifyComposition(c);
    // Total détenu, total remis en jeu, série, identifiant, groupe absent, sommes.
    expect(problems.length).toBeGreaterThanOrEqual(6);
    expect(problems.some((p) => p.includes("total des sièges"))).toBe(true);
    expect(problems.some((p) => p.includes("hors de la série renouvelée"))).toBe(true);
    expect(problems.some((p) => p.includes("sans identifiant"))).toBe(true);
    expect(problems.some((p) => p.includes("groupe NI absent"))).toBe(true);
  });
});

describe("summariseOutgoingMajority", () => {
  it("additionne les sièges de la majorité sortante, 107 sur 190", () => {
    expect(summariseOutgoingMajority(validComposition())).toEqual({ held: 190, atStake: 107 });
  });
});
