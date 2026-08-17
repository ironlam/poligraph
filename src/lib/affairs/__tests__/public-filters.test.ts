import { describe, it, expect } from "vitest";
import {
  getPublishedAffairWhere,
  getPublishedAffairSqlWhere,
  getAdverseAffairWhere,
  getConvictionOnlyWhere,
  getMisEnCauseWhere,
  getFavorableOutcomeWhere,
} from "@/lib/affairs/public-filters";

/** Statuts qui ne doivent JAMAIS apparaître dans un agrégat à charge. */
const EXCLUDED_STATUSES = [
  "ENQUETE_PRELIMINAIRE",
  "RELAXE",
  "ACQUITTEMENT",
  "NON_LIEU",
  "CLASSEMENT_SANS_SUITE",
  "PRESCRIPTION",
] as const;

/** Involvements qui ne doivent JAMAIS être comptés comme mis en cause. */
const EXCLUDED_INVOLVEMENTS = ["MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const;

function statusesOf(where: { status?: unknown }): string[] {
  return (where.status as { in: string[] }).in;
}

function involvementsOf(where: { involvement?: unknown }): string[] {
  return (where.involvement as { in: string[] }).in;
}

describe("public-filters — contrat des agrégats (RGPD art. 10)", () => {
  it("tous les builders filtrent PUBLISHED", () => {
    for (const where of [
      getPublishedAffairWhere(),
      getAdverseAffairWhere(),
      getConvictionOnlyWhere(),
      getMisEnCauseWhere(),
      getFavorableOutcomeWhere(),
    ]) {
      expect(where.publicationStatus).toBe("PUBLISHED");
    }
  });

  it("garde le filtre SQL brut cohérent avec le builder Prisma", () => {
    const sql = getPublishedAffairSqlWhere();

    expect(sql.sql).toContain('a."publicationStatus" =');
    expect(sql.values).toEqual([getPublishedAffairWhere().publicationStatus]);
  });

  it("rejette tout alias SQL judiciaire non inventorié", () => {
    expect(() => getPublishedAffairSqlWhere("unsafe" as "a")).toThrow(
      "Unsupported public affair SQL alias: unsafe"
    );
  });

  it("l'agrégat à charge exclut chaque statut non validé ou favorable", () => {
    const statuses = statusesOf(getAdverseAffairWhere());
    for (const excluded of EXCLUDED_STATUSES) {
      expect(statuses).not.toContain(excluded);
    }
  });

  it("l'agrégat à charge exclut mentions, victimes et plaignants", () => {
    const involvements = involvementsOf(getAdverseAffairWhere());
    for (const excluded of EXCLUDED_INVOLVEMENTS) {
      expect(involvements).not.toContain(excluded);
    }
    expect(involvements).toEqual(["DIRECT", "INDIRECT"]);
  });

  it("« condamnés » = statuts de condamnation uniquement", () => {
    expect(statusesOf(getConvictionOnlyWhere()).sort()).toEqual([
      "APPEL_EN_COURS",
      "CONDAMNATION_DEFINITIVE",
      "CONDAMNATION_PREMIERE_INSTANCE",
      "POURVOI_EN_CASSATION",
    ]);
  });

  it("« mis en cause » = Tier 2 strict, sans enquête préliminaire", () => {
    expect(statusesOf(getMisEnCauseWhere()).sort()).toEqual([
      "INSTRUCTION",
      "MISE_EN_EXAMEN",
      "PROCES_EN_COURS",
      "RENVOI_TRIBUNAL",
    ]);
  });

  it("issues favorables = procédures closes sans condamnation (PRESCRIPTION incluse)", () => {
    expect(statusesOf(getFavorableOutcomeWhere()).sort()).toEqual([
      "ACQUITTEMENT",
      "CLASSEMENT_SANS_SUITE",
      "NON_LIEU",
      "PRESCRIPTION",
      "RELAXE",
    ]);
  });
});
