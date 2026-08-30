import { describe, expect, it } from "vitest";
import { MEASURE_SUBTOPICS, MEASURE_SUBTOPIC_TAXONOMY_VERSION } from "@/config/measure-subtopics";

describe("taxonomie des sous-thèmes de mesure", () => {
  it("contient des slugs et des ordres uniques dans chaque thème", () => {
    const slugs = MEASURE_SUBTOPICS.map((subtopic) => subtopic.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const theme of new Set(MEASURE_SUBTOPICS.map((subtopic) => subtopic.theme))) {
      const sortOrders = MEASURE_SUBTOPICS.filter((subtopic) => subtopic.theme === theme).map(
        (subtopic) => subtopic.sortOrder
      );
      expect(new Set(sortOrders).size).toBe(sortOrders.length);
    }
  });

  it("définit le périmètre de Racisme et antisémitisme", () => {
    const subtopic = MEASURE_SUBTOPICS.find(
      (candidate) => candidate.slug === "racisme-antisemitisme"
    );

    expect(MEASURE_SUBTOPIC_TAXONOMY_VERSION).toBe("2026-08-30-v4");
    expect(subtopic).toMatchObject({
      label: "Racisme et antisémitisme",
      theme: "SOCIETE_DROITS_LIBERTES",
      aliases: [
        "racisme",
        "raciste",
        "antisémitisme",
        "antisémite",
        "xénophobie",
        "discriminations raciales",
      ],
    });
    expect(subtopic?.classifierGuidance).toContain("couleur de peau");
  });
});
