import { describe, it, expect } from "vitest";
import { verifyComposition } from "../outgoing-composition";
import type { OutgoingSenateComposition } from "@/types/stats-snapshots";

/**
 * The capture happens once and can never be redone, so these invariants run before the
 * write, not after. A capture that passes them is trustworthy; one that fails must
 * leave the database untouched.
 */

function seat(index: number, series = 2) {
  return {
    politicianId: `pol_${index}`,
    fullName: `Sénateur ${index}`,
    slug: `senateur-${index}`,
    departmentCode: "33",
    constituency: "Gironde",
    series,
    groupName: "Groupe A",
    groupShortName: "GA",
  };
}

/** A capture matching the published figures for this renewal. */
function validComposition(): OutgoingSenateComposition {
  return {
    capturedAt: "2026-08-10T09:00:00.000Z",
    totalSeats: 348,
    seatsAtStake: 178,
    seats: Array.from({ length: 178 }, (_, i) => seat(i)),
    groups: [
      { groupName: "Groupe A", shortName: "GA", held: 131, atStake: 77 },
      { groupName: "Groupe B", shortName: "GB", held: 59, atStake: 30 },
      { groupName: "Groupe C", shortName: null, held: 64, atStake: 30 },
      { groupName: "Groupe D", shortName: null, held: 20, atStake: 9 },
      { groupName: "Groupe E", shortName: null, held: 19, atStake: 11 },
      { groupName: "Groupe F", shortName: null, held: 18, atStake: 4 },
      { groupName: "Groupe G", shortName: null, held: 17, atStake: 9 },
      { groupName: "Groupe H", shortName: null, held: 16, atStake: 7 },
      { groupName: "Groupe I", shortName: null, held: 4, atStake: 1 },
    ],
  };
}

describe("verifyComposition : capture conforme", () => {
  it("ne signale rien sur une capture qui tient les quatre invariants", () => {
    expect(verifyComposition(validComposition())).toEqual([]);
  });

  it("retrouve 178 sur 348 en agrégeant les groupes", () => {
    const c = validComposition();
    expect(c.groups.reduce((s, g) => s + g.atStake, 0)).toBe(178);
    expect(c.groups.reduce((s, g) => s + g.held, 0)).toBe(348);
  });

  /**
   * Régression sur l'invariant lui-même. Une première version dérivait la majorité
   * sortante comme « les deux groupes détenant le plus de sièges ». C'est faux : le
   * deuxième groupe par sièges détenus (64) n'est pas celui de la majorité (59), donc
   * la somme par rang donne 195 et non 190. Elle coïncidait sur les sièges remis en
   * jeu parce que les deux groupes en ont 30, ce qui est exactement ainsi qu'un
   * invariant faux passe une relecture. Un groupe s'identifie par son couple, jamais
   * par son rang.
   */
  it("les 107 sur 190 viennent des couples attendus, pas du classement par taille", () => {
    const c = validComposition();
    const byHeld = [...c.groups].sort((a, b) => b.held - a.held).slice(0, 2);
    expect(byHeld.reduce((s, g) => s + g.held, 0)).not.toBe(190);

    const lr = c.groups.find((g) => g.held === 131 && g.atStake === 77)!;
    const uc = c.groups.find((g) => g.held === 59 && g.atStake === 30)!;
    expect(lr.held + uc.held).toBe(190);
    expect(lr.atStake + uc.atStake).toBe(107);
  });

  it("exige un groupe distinct par couple attendu", () => {
    const c = validComposition();
    // Deux groupes au même couple 18/4 ne peuvent pas satisfaire deux attentes.
    c.groups[1] = { ...c.groups[1]!, held: 18, atStake: 4 };
    c.groups[2] = { ...c.groups[2]!, held: 105, atStake: 30 };
    expect(verifyComposition(c).some((p) => p.includes("30 sièges remis en jeu sur 59"))).toBe(
      true
    );
  });
});

describe("verifyComposition : refus", () => {
  it("refuse un total de sièges inattendu", () => {
    const c = { ...validComposition(), totalSeats: 351 };
    expect(verifyComposition(c).some((p) => p.includes("total des sièges"))).toBe(true);
  });

  it("refuse un nombre de sièges remis en jeu inattendu", () => {
    const c = { ...validComposition(), seatsAtStake: 176 };
    expect(verifyComposition(c).some((p) => p.includes("sièges remis en jeu"))).toBe(true);
  });

  it("refuse une liste de sièges incomplète", () => {
    const c = validComposition();
    c.seats = c.seats.slice(0, 177);
    expect(verifyComposition(c).some((p) => p.includes("sièges capturés"))).toBe(true);
  });

  // Capturer un siège de série 1 signifierait que la requête ne filtre pas ce qu'on croit.
  it("refuse un siège hors de la série renouvelée", () => {
    const c = validComposition();
    c.seats[0] = seat(0, 1);
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

  // L'agrégat et les lignes individuelles doivent raconter la même histoire.
  it("refuse une somme par groupe incohérente avec les totaux", () => {
    const c = validComposition();
    c.groups[0] = { ...c.groups[0]!, held: 130 };
    const problems = verifyComposition(c);
    expect(problems.some((p) => p.includes("somme des sièges par groupe"))).toBe(true);
  });

  it("refuse l'absence d'une exposition de groupe attendue", () => {
    const c = validComposition();
    c.groups[5] = { ...c.groups[5]!, atStake: 5, held: 17 };
    expect(verifyComposition(c).some((p) => p.includes("4 sièges remis en jeu sur 18"))).toBe(true);
  });

  it("refuse un couple de majorité altéré, même à totaux constants", () => {
    const c = validComposition();
    // Un siège déplacé du groupe à 59 vers un autre : les totaux restent justes, mais
    // le couple 59/30 disparaît et l'addition 131 + 59 = 190 ne tient plus.
    c.groups[1] = { ...c.groups[1]!, held: 58 };
    c.groups[3] = { ...c.groups[3]!, held: 21 };
    expect(verifyComposition(c).some((p) => p.includes("30 sièges remis en jeu sur 59"))).toBe(
      true
    );
  });

  it("accumule tous les problèmes plutôt que de s'arrêter au premier", () => {
    const c = { ...validComposition(), totalSeats: 300, seatsAtStake: 100 };
    expect(verifyComposition(c).length).toBeGreaterThan(2);
  });
});
