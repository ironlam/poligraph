import { describe, expect, it } from "vitest";
import {
  findVerifiedAffairPressEventSource,
  isVerifiedAffairPressUrl,
} from "@/config/affair-sources";

describe("sources de presse des événements d’affaire", () => {
  const completeSource = {
    url: "https://www.lemonde.fr/politique/article/2026/08/27/suivi.html",
    title: "Titre original de l’article",
    publisher: "Le Monde",
    publishedAt: new Date("2026-08-27T08:00:00.000Z"),
    excerpt: "Extrait vérifié dans le contenu de l’article.",
  };

  it("accepte les domaines journalistiques vérifiés et leurs sous-domaines", () => {
    expect(isVerifiedAffairPressUrl(completeSource.url)).toBe(true);
    expect(isVerifiedAffairPressUrl("https://politique.lefigaro.fr/article")).toBe(true);
    expect(isVerifiedAffairPressUrl("https://lemonde.fr.example.net/article")).toBe(false);
  });

  it("accepte franceinfo sous ses deux domaines", () => {
    expect(isVerifiedAffairPressUrl("https://www.franceinfo.fr/politique/article.html")).toBe(true);
    expect(isVerifiedAffairPressUrl("https://www.francetvinfo.fr/politique/article.html")).toBe(
      true
    );
  });

  it("exige une date de publication et un extrait explicites", () => {
    expect(findVerifiedAffairPressEventSource([completeSource])).toEqual(completeSource);
    expect(
      findVerifiedAffairPressEventSource([{ ...completeSource, publishedAt: null }])
    ).toBeNull();
    expect(findVerifiedAffairPressEventSource([{ ...completeSource, excerpt: null }])).toBeNull();
  });

  it("ne déduit pas la date depuis une URL datée", () => {
    const sourceWithoutMetadata = {
      ...completeSource,
      publishedAt: null,
    };

    expect(findVerifiedAffairPressEventSource([sourceWithoutMetadata])).toBeNull();
  });
});
