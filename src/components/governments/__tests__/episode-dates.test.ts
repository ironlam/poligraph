import { describe, expect, it } from "vitest";
import {
  appointedOn,
  displayTitle,
  episodeDates,
  governmentDatesLine,
  governmentPeriod,
} from "@/components/governments/format";
import type { PublishedGovernment } from "@/lib/governments/mapping";

const episode = {
  start: "2024-09-21",
  end: "2024-12-05",
  endKind: "COLLECTIVE_RESIGNATION" as const,
  currentAffairsEndedAt: null as string | null,
  lastConfirmedAt: null,
};

const attested = {
  currentAffairsAttested: true,
  resignedEvidence: "ACT" as const,
  endedAt: "2024-12-23" as string | null,
};

describe("episodeDates : affaires courantes", () => {
  it("n'en parle pas quand le régime n'est pas attesté par un acte", () => {
    const text = episodeDates(episode, { ...attested, currentAffairsAttested: false });
    expect(text).not.toContain("affaires courantes");
  });

  it("n'en parle pas quand la démission n'est pas prouvée par un acte", () => {
    const text = episodeDates(episode, { ...attested, resignedEvidence: "DATASET" });
    expect(text).not.toContain("affaires courantes");
  });

  it("n'en parle pas pour une fin individuelle, ni sans gouvernement", () => {
    expect(episodeDates({ ...episode, endKind: "INDIVIDUAL" }, attested)).not.toContain(
      "affaires courantes"
    );
    expect(episodeDates(episode, undefined)).not.toContain("affaires courantes");
  });

  it("s'arrête la veille de la fin du gouvernement", () => {
    expect(episodeDates(episode, attested)).toContain(
      "puis affaires courantes jusqu'au 22 décembre 2024"
    );
  });

  it("préfère la borne individuelle quand elle est plus courte", () => {
    const text = episodeDates({ ...episode, currentAffairsEndedAt: "2024-12-10" }, attested);
    expect(text).toContain("puis affaires courantes jusqu'au 10 décembre 2024");
  });

  it("ne dépasse jamais la veille de la fin du gouvernement", () => {
    const text = episodeDates({ ...episode, currentAffairsEndedAt: "2025-01-10" }, attested);
    expect(text).toContain("jusqu'au 22 décembre 2024");
  });

  it("n'écrit rien sans fin de gouvernement", () => {
    expect(episodeDates(episode, { ...attested, endedAt: null })).not.toContain(
      "affaires courantes"
    );
  });
});

describe("appointedOn", () => {
  it("reste neutre", () => {
    expect(appointedOn("2024-09-21")).toBe("Nomination le 21 septembre 2024");
    expect(episodeDates({ ...episode, end: null, lastConfirmedAt: null }, undefined)).toBe(
      "Nomination le 21 septembre 2024 ; fin de fonction non documentée"
    );
  });
});

describe("displayTitle", () => {
  it("corrige « d'Etat » et met la majuscule initiale", () => {
    expect(displayTitle("Secrétaire d'Etat chargé du Numérique")).toBe(
      "Secrétaire d'État chargé du Numérique"
    );
    expect(displayTitle("garde des sceaux, ministre de la Justice")).toBe(
      "Garde des sceaux, ministre de la Justice"
    );
    expect(displayTitle("Ministre d’Etat")).toBe("Ministre d’État");
  });

  it("ne touche pas au reste", () => {
    expect(displayTitle("Ministre de l'Économie, des Finances")).toBe(
      "Ministre de l'Économie, des Finances"
    );
    expect(displayTitle("")).toBe("");
  });
});

describe("governmentDatesLine : fin et démission", () => {
  const gov = {
    primeMinisterAppointedAt: "2024-01-09",
    primeMinister: { gender: "M" },
    formedAt: "2024-01-11",
    resignedAt: "2024-07-16",
    endedAt: "2024-09-21",
    currentAffairsAttested: false,
  } as unknown as PublishedGovernment;

  it("non attesté : démission puis remplacement", () => {
    const line = governmentDatesLine(gov);
    expect(line).toContain("Démission le 16 juillet 2024, remplacé le 21 septembre 2024.");
    expect(line).not.toContain("affaires courantes");
  });

  it("attesté : affaires courantes jusqu'à la veille", () => {
    const line = governmentDatesLine({ ...gov, currentAffairsAttested: true });
    expect(line).toContain(
      "Démission le 16 juillet 2024, affaires courantes jusqu'au 20 septembre 2024."
    );
  });
});

describe("governmentPeriod", () => {
  const base = {
    formedAt: "2024-09-21" as string | null,
    primeMinisterAppointedAt: "2024-09-05",
    endedAt: "2024-12-23" as string | null,
    resignedAt: null as string | null,
    primeMinister: { slug: "x", fullName: "X", gender: "M" as const },
  };

  it("omet l'année de début quand elle est celle de la fin", () => {
    expect(governmentPeriod(base)).toBe("Du 21 septembre au 23 décembre 2024");
  });

  it("garde les deux années sinon, avec « 1er »", () => {
    expect(governmentPeriod({ ...base, formedAt: "2016-12-01", endedAt: "2017-05-10" })).toBe(
      "Du 1er décembre 2016 au 10 mai 2017"
    );
  });

  it("gouvernement en exercice : date de l'équipe", () => {
    expect(governmentPeriod({ ...base, formedAt: "2025-10-12", endedAt: null })).toBe(
      "Équipe nommée le 12 octobre 2025"
    );
  });

  it("en exercice sans date d'équipe : nomination du Premier ministre, puis démission", () => {
    expect(
      governmentPeriod({ ...base, formedAt: null, endedAt: null, resignedAt: "2024-12-05" })
    ).toBe("Premier ministre nommé le 5 septembre 2024, démission le 5 décembre 2024");
  });
});
