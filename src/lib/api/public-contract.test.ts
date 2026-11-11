import { describe, expect, it } from "vitest";
import { FACTCHECK_ALLOWED_SOURCES } from "@/config/labels";
import {
  getMandateStartDatePublicationStatus,
  getPublicAffairSemantics,
  getPublicFactCheckWhere,
  getPublicPartySqlWhere,
  isAllowedFactCheckSource,
  PUBLIC_PARTY_WHERE,
} from "@/lib/api/public-contract";
import { PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE } from "@/lib/data/presidential-candidacy-policy";

describe("canonical external public fact-check boundary", () => {
  it("always requires PUBLISHED and an allowed source", () => {
    expect(getPublicFactCheckWhere()).toEqual({
      publicationStatus: "PUBLISHED",
      source: { in: [...FACTCHECK_ALLOWED_SOURCES] },
    });
  });

  it("combines an explicit source with the public predicate instead of replacing it", () => {
    const source = FACTCHECK_ALLOWED_SOURCES[0]!;
    expect(getPublicFactCheckWhere(source)).toEqual({
      AND: [
        {
          publicationStatus: "PUBLISHED",
          source: { in: [...FACTCHECK_ALLOWED_SOURCES] },
        },
        { source },
      ],
    });
  });

  it("does not consider arbitrary or empty sources allowed", () => {
    expect(isAllowedFactCheckSource("source-interne-non-publique")).toBe(false);
    expect(isAllowedFactCheckSource("")).toBe(false);
    expect(isAllowedFactCheckSource(FACTCHECK_ALLOWED_SOURCES[0]!)).toBe(true);
  });
});

describe("canonical public party boundary", () => {
  it("opens a party on a published politician or a tracked presidential candidacy", () => {
    expect(PUBLIC_PARTY_WHERE).toEqual({
      NOT: {
        politicians: { none: { publicationStatus: "PUBLISHED" } },
        candidacies: { none: PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE },
      },
    });
  });

  it("exposes no OR or AND key, because callers spread it next to their own", () => {
    // `{ ...PUBLIC_PARTY_WHERE, OR: [...] }` would overwrite an OR here and drop the gate.
    expect(Object.keys(PUBLIC_PARTY_WHERE)).toEqual(["NOT"]);
  });

  it("binds the raw SQL gate to the Party alias, members and candidacies", () => {
    const sql = getPublicPartySqlWhere();

    expect(sql.sql).toContain('public_party_member."currentPartyId" = p."id"');
    expect(sql.sql).toContain('public_party_candidacy."partyId" = p."id"');
    expect(sql.sql).toContain('public_party_candidacy."sourceLabel" IS NOT NULL');
    expect(sql.values).toEqual(["PUBLISHED", "PUBLISHED"]);
  });
});

describe("public affair semantics", () => {
  it("keeps a charging status attributable for a directly involved politician", () => {
    const semantics = getPublicAffairSemantics({
      status: "MISE_EN_EXAMEN",
      category: "CORRUPTION",
      involvement: "DIRECT",
      jurisdictionOrder: "PENAL",
    });

    expect(semantics.statusAppliesToPolitician).toBe(true);
    expect(semantics.needsPresumption).toBe(true);
    expect(semantics.certaintyLevel).toBe("EN_COURS");
    expect(semantics.statusLabel).toBe("Mise en examen");
  });

  it("never exposes a non-penal decision as a conviction (retour Codex #1108)", () => {
    const semantics = getPublicAffairSemantics({
      status: "CONDAMNATION_DEFINITIVE",
      category: "HARCELEMENT_MORAL",
      involvement: "DIRECT",
      jurisdictionOrder: "CIVIL",
    });

    expect(semantics.statusLabel).toBe("Décision définitive");
    expect(semantics.statusDescription).toContain("n'est pas une condamnation pénale");
    expect(semantics.certaintyLevel).toBeNull();
    expect(semantics.certaintyLabel).toBeNull();
    expect(semantics.countedInAdverseAggregates).toBe(false);
  });

  it("never attributes the affair status or certainty to a victim", () => {
    const semantics = getPublicAffairSemantics({
      status: "CONDAMNATION_DEFINITIVE",
      category: "VIOLENCE",
      involvement: "VICTIM",
      jurisdictionOrder: "PENAL",
    });

    expect(semantics.statusAppliesToPolitician).toBe(false);
    expect(semantics.needsPresumption).toBe(false);
    expect(semantics.certaintyLevel).toBeNull();
    expect(semantics.certaintyLabel).toBeNull();
    expect(semantics.involvementLabel).toBe("Victime");
  });

  it("uses the canonical French label for the instruction-closed status", () => {
    const semantics = getPublicAffairSemantics({
      status: "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN",
      category: "AUTRE",
      involvement: "DIRECT",
      jurisdictionOrder: "PENAL",
    });

    expect(semantics.statusLabel).toBe("Instruction clôturée, sans mise en examen");
    expect(semantics.judicialMaturity).toBe("INSTRUCTION_CLOSE");
    expect(semantics.judicialMaturityLabel).toBe("Instruction clôturée sans mise en examen");
    expect(semantics.needsPresumption).toBe(true);
  });
});

describe("mandate date publication", () => {
  it("marks senate start dates unverified until provenance issue #698 is resolved", () => {
    expect(getMandateStartDatePublicationStatus("SENATEUR")).toBe("UNVERIFIED");
  });

  it("keeps non-senate mandate start dates available", () => {
    expect(getMandateStartDatePublicationStatus("DEPUTE")).toBe("AVAILABLE");
  });
});
