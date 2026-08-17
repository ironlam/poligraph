import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { openapiSpec } from "@/lib/openapi";

function asObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((current, key) => asObject(current)[key], value);
}

describe("contrat OpenAPI MCP-01", () => {
  it("documente en date-time les Date Prisma sérialisées sans transformation", async () => {
    const timestamp = new Date("2026-08-16T12:34:56.789Z");
    const payload = await NextResponse.json({ timestamp }).json();
    expect(payload.timestamp).toBe("2026-08-16T12:34:56.789Z");

    const fields = [
      ["Politician", "birthDate"],
      ["Mandate", "startDate"],
      ["Source", "publishedAt"],
      ["Affair", "factsDate"],
      ["Scrutin", "votingDate"],
      ["Party", "foundedDate"],
      ["ElectionSummary", "round1Date"],
      ["ElectionDetails", "registrationDeadline"],
    ] as const;

    for (const [schema, property] of fields) {
      expect(
        at(openapiSpec, "components", "schemas", schema, "properties", property)
      ).toMatchObject({ type: "string", format: "date-time" });
    }
  });

  it("déclare nullable la relation partyAtTime réellement exposée sans inventer partyAtTimeId", () => {
    const affairProperties = asObject(
      at(openapiSpec, "components", "schemas", "Affair", "properties")
    );

    expect(affairProperties).not.toHaveProperty("partyAtTimeId");
    expect(affairProperties.partyAtTime).toMatchObject({
      nullable: true,
      allOf: [{ $ref: "#/components/schemas/PartySummary" }],
    });
  });

  it("publie un composant FactCheck fidèle au runtime et le relie aux réponses JSON", () => {
    const factCheckProperties = asObject(
      at(openapiSpec, "components", "schemas", "FactCheck", "properties")
    );

    expect(Object.keys(factCheckProperties)).toEqual([
      "id",
      "slug",
      "claimText",
      "claimant",
      "title",
      "verdict",
      "verdictRating",
      "source",
      "sourceUrl",
      "publishedAt",
      "claimDate",
      "politicians",
    ]);
    expect(factCheckProperties.publishedAt).toMatchObject({
      type: "string",
      format: "date-time",
    });
    expect(factCheckProperties.claimDate).toMatchObject({
      type: "string",
      format: "date-time",
      nullable: true,
    });

    expect(
      at(
        openapiSpec,
        "paths",
        "/api/factchecks",
        "get",
        "responses",
        "200",
        "content",
        "application/json",
        "schema",
        "properties",
        "data",
        "items",
        "$ref"
      )
    ).toBe("#/components/schemas/FactCheck");
    expect(
      at(
        openapiSpec,
        "paths",
        "/api/politiques/{slug}/factchecks",
        "get",
        "responses",
        "200",
        "content",
        "application/json",
        "schema",
        "properties",
        "factchecks",
        "items",
        "$ref"
      )
    ).toBe("#/components/schemas/FactCheck");
  });

  it("conserve les identifiants Prisma documentés au format CUID", () => {
    for (const schema of ["Politician", "Affair", "FactCheck", "Party", "ElectionDetails"]) {
      expect(at(openapiSpec, "components", "schemas", schema, "properties", "id")).toMatchObject({
        type: "string",
        format: "cuid",
      });
    }
  });
});
