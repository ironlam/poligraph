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
  it("requires at least one published politician on every public party", () => {
    expect(PUBLIC_PARTY_WHERE).toEqual({
      politicians: { some: { publicationStatus: "PUBLISHED" } },
    });
  });

  it("binds the raw SQL gate to the Party alias and published status", () => {
    const sql = getPublicPartySqlWhere();

    expect(sql.sql).toContain('public_party_member."currentPartyId" = p."id"');
    expect(sql.values).toEqual(["PUBLISHED"]);
  });
});

describe("public affair semantics", () => {
  it("keeps a charging status attributable for a directly involved politician", () => {
    const semantics = getPublicAffairSemantics({
      status: "MISE_EN_EXAMEN",
      category: "CORRUPTION",
      involvement: "DIRECT",
    });

    expect(semantics.statusAppliesToPolitician).toBe(true);
    expect(semantics.needsPresumption).toBe(true);
    expect(semantics.certaintyLevel).toBe("EN_COURS");
    expect(semantics.statusLabel).toBe("Mise en examen");
  });

  it("never attributes the affair status or certainty to a victim", () => {
    const semantics = getPublicAffairSemantics({
      status: "CONDAMNATION_DEFINITIVE",
      category: "VIOLENCE",
      involvement: "VICTIM",
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
