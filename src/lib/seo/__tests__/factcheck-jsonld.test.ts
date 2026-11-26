import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildFactCheckJsonLd, type FactCheckJsonLdInput } from "@/lib/seo/factcheck-jsonld";
import { SITE_URL } from "@/config/site";

const base: FactCheckJsonLdInput = {
  slug: "2026-11-01-exemple",
  title: "Non, le député X n'a pas voté contre la loi Y",
  description: "Faux. « Il a voté contre »",
  publishedAt: new Date("2026-11-01T10:00:00Z"),
  createdAt: new Date("2026-11-02T08:00:00Z"),
  source: "AFP Factuel",
  sourceUrl: "https://factuel.afp.com/exemple",
  author: null,
  people: [],
};

const jeanDupont = { slug: "jean-dupont", fullName: "Jean Dupont" };
const marieMartin = { slug: "marie-martin", fullName: "Marie Martin" };

describe("buildFactCheckJsonLd", () => {
  it("décrit une page Poligraph qui cite l'article de la rédaction, avec un auteur", () => {
    const jsonLd = buildFactCheckJsonLd({
      ...base,
      author: jeanDupont,
      people: [jeanDupont, marieMartin],
    });

    expect(jsonLd).toMatchInlineSnapshot(`
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "about": {
          "@type": "Person",
          "name": "Jean Dupont",
          "url": "${SITE_URL}/politiques/jean-dupont",
        },
        "citation": {
          "@type": "CreativeWork",
          "datePublished": "2026-11-01",
          "headline": "Non, le député X n'a pas voté contre la loi Y",
          "publisher": {
            "@type": "Organization",
            "name": "AFP Factuel",
          },
          "url": "https://factuel.afp.com/exemple",
        },
        "datePublished": "2026-11-02",
        "description": "Faux. « Il a voté contre »",
        "inLanguage": "fr-FR",
        "isBasedOn": "https://factuel.afp.com/exemple",
        "mentions": [
          {
            "@type": "Person",
            "name": "Jean Dupont",
            "url": "${SITE_URL}/politiques/jean-dupont",
          },
          {
            "@type": "Person",
            "name": "Marie Martin",
            "url": "${SITE_URL}/politiques/marie-martin",
          },
        ],
        "name": "Non, le député X n'a pas voté contre la loi Y",
        "publisher": {
          "@type": "Organization",
          "name": "Poligraph",
          "url": "${SITE_URL}",
        },
        "url": "${SITE_URL}/factchecks/2026-11-01-exemple",
      }
    `);
  });

  it("sans auteur, la page porte sur la seule personne citée", () => {
    const jsonLd = buildFactCheckJsonLd({ ...base, people: [marieMartin] });
    expect(jsonLd.about).toEqual({
      "@type": "Person",
      name: "Marie Martin",
      url: `${SITE_URL}/politiques/marie-martin`,
    });
  });

  it("sans auteur et avec plusieurs personnes citées, aucune n'est mise en avant", () => {
    const jsonLd = buildFactCheckJsonLd({ ...base, people: [jeanDupont, marieMartin] });
    expect(jsonLd).not.toHaveProperty("about");
    expect(jsonLd.mentions).toHaveLength(2);
  });

  it("sans personne liée, ni about ni mentions", () => {
    const jsonLd = buildFactCheckJsonLd(base);
    expect(jsonLd).not.toHaveProperty("about");
    expect(jsonLd).not.toHaveProperty("mentions");
  });

  it("n'attribue jamais la vérification à Poligraph : pas de ClaimReview ni de note", () => {
    const serialized = JSON.stringify(buildFactCheckJsonLd({ ...base, author: jeanDupont }));
    expect(serialized).not.toContain("ClaimReview");
    expect(serialized).not.toContain("reviewRating");
    expect(buildFactCheckJsonLd(base).citation.publisher?.name).toBe("AFP Factuel");
  });

  it("omet l'éditeur de l'article quand la rédaction est inconnue", () => {
    const jsonLd = buildFactCheckJsonLd({ ...base, source: "" });
    expect(jsonLd.citation).not.toHaveProperty("publisher");
  });
});

describe("aucun balisage ClaimReview émis par le site", () => {
  // Google lit tout ClaimReview comme une vérification écrite par la page qui le porte.
  // Poligraph relaie des vérifications : il ne doit en émettre nulle part.
  const SRC = join(process.cwd(), "src");
  const EMITTERS = ["app", "components", "lib"];

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === "__tests__" ? [] : sourceFiles(path);
      }
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it.each(EMITTERS)("src/%s ne déclare aucun @type ClaimReview", (dir) => {
    const offenders = sourceFiles(join(SRC, dir)).filter((file) =>
      /["']@type["']\s*:\s*["']ClaimReview["']/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});
