import { describe, expect, it } from "vitest";
import { formatPublicId, formatPublicIdForEntity, isValidPublicId, parsePublicId } from "../format";

describe("parsePublicId", () => {
  it("parses a valid politician id", () => {
    expect(parsePublicId("PG-000542")).toEqual({
      publicId: "PG-000542",
      prefix: "PG",
      entityType: "politician",
      sequence: 542,
    });
  });

  it("parses each supported prefix to the correct entity type", () => {
    const cases: Array<[string, string]> = [
      ["PG-000001", "politician"],
      ["AF-000001", "affair"],
      ["FC-000001", "factcheck"],
      ["SC-000001", "scrutin"],
      ["PT-000001", "party"],
      ["EL-000001", "election"],
      ["MA-000001", "mandate"],
      ["DO-000001", "dossier"],
      ["GP-000001", "group"],
      ["LM-000001", "electoralList"],
    ];

    for (const [id, entityType] of cases) {
      expect(parsePublicId(id)?.entityType).toBe(entityType);
    }
  });

  it("accepts sequences longer than 6 digits (overflow future-proofing)", () => {
    const parsed = parsePublicId("PG-1234567");
    expect(parsed?.sequence).toBe(1234567);
  });

  it("returns null for unknown prefixes", () => {
    expect(parsePublicId("XX-000001")).toBeNull();
    expect(parsePublicId("ZZ-999999")).toBeNull();
  });

  it("returns null for malformed strings", () => {
    expect(parsePublicId("")).toBeNull();
    expect(parsePublicId("PG")).toBeNull();
    expect(parsePublicId("PG-")).toBeNull();
    expect(parsePublicId("PG-12345")).toBeNull(); // too short
    expect(parsePublicId("pg-000001")).toBeNull(); // lowercase
    expect(parsePublicId("PG_000001")).toBeNull(); // wrong separator
    expect(parsePublicId("PG-00000A")).toBeNull(); // non-digit
    expect(parsePublicId("eric-zemmour")).toBeNull(); // slug
    expect(parsePublicId("cmlv85kh0017hemv5muq2gtad")).toBeNull(); // cuid
  });
});

describe("formatPublicId", () => {
  it("zero-pads to 6 digits by default", () => {
    expect(formatPublicId("AF", 1)).toBe("AF-000001");
    expect(formatPublicId("AF", 42)).toBe("AF-000042");
    expect(formatPublicId("AF", 999999)).toBe("AF-999999");
  });

  it("does not truncate sequences above 999999", () => {
    expect(formatPublicId("PG", 1000000)).toBe("PG-1000000");
    expect(formatPublicId("PG", 36419)).toBe("PG-036419");
  });

  it("rejects non-positive or non-integer sequences", () => {
    expect(() => formatPublicId("AF", 0)).toThrow();
    expect(() => formatPublicId("AF", -1)).toThrow();
    expect(() => formatPublicId("AF", 1.5)).toThrow();
    expect(() => formatPublicId("AF", Number.NaN)).toThrow();
  });

  it("round-trips through parsePublicId", () => {
    const id = formatPublicId("FC", 2891);
    const parsed = parsePublicId(id);
    expect(parsed?.sequence).toBe(2891);
    expect(parsed?.prefix).toBe("FC");
    expect(parsed?.entityType).toBe("factcheck");
  });
});

describe("formatPublicIdForEntity", () => {
  it("maps entity types to the correct prefix", () => {
    expect(formatPublicIdForEntity("affair", 1)).toBe("AF-000001");
    expect(formatPublicIdForEntity("factcheck", 1)).toBe("FC-000001");
    expect(formatPublicIdForEntity("electoralList", 1)).toBe("LM-000001");
  });
});

describe("isValidPublicId", () => {
  it("returns true for valid identifiers", () => {
    expect(isValidPublicId("AF-000542")).toBe(true);
    expect(isValidPublicId("PG-036419")).toBe(true);
  });

  it("returns false for invalid or unknown identifiers", () => {
    expect(isValidPublicId("AF-1")).toBe(false);
    expect(isValidPublicId("xx-000001")).toBe(false);
    expect(isValidPublicId("ZZ-000001")).toBe(false);
  });
});
