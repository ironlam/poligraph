import { describe, expect, it } from "vitest";

import { decideCumul, optionDeadline } from "@/lib/mandates/cumul-evidence";

const DEBUT_MAIRE = new Date("2026-03-26T00:00:00Z");

describe("optionDeadline", () => {
  it("place le délai d'option 30 jours après la prise de fonction locale", () => {
    // LO 141-1 : l'incompatibilité ouvre un délai d'option de 30 jours, au terme duquel le
    // mandat le plus ancien prend fin de plein droit.
    expect(optionDeadline(DEBUT_MAIRE).toISOString().slice(0, 10)).toBe("2026-04-25");
  });
});

describe("decideCumul", () => {
  it("s'appuie sur un vote postérieur au délai, quand rien ne confirme le mandat local", () => {
    expect(
      decideCumul({
        localStartDate: DEBUT_MAIRE,
        lastParliamentaryVote: new Date("2026-07-21T00:00:00Z"),
        localConfirmedAt: null,
      })
    ).toEqual({
      action: "close-local",
      endDate: new Date("2026-04-25T00:00:00Z"),
      reason: "vote parlementaire du 2026-07-21, postérieur au délai d'option du 2026-04-25",
    });
  });

  it("ne tranche pas quand les deux sources se confirment après le délai", () => {
    // LE CAS QUI A COÛTÉ UNE ERREUR. Éric Ciotti a voté le 2026-07-21, ce qui prouve qu'il
    // siège. Mais le registre publié le 2026-08-11 le nomme maire de Nice depuis le 27 mars.
    // Le vote prouve que le mandat parlementaire continue, il ne prouve RIEN sur la fin du
    // mandat local. Deux sources récentes qui se contredisent sont une question pour un
    // humain, jamais une écriture.
    expect(
      decideCumul({
        localStartDate: DEBUT_MAIRE,
        lastParliamentaryVote: new Date("2026-07-21T00:00:00Z"),
        localConfirmedAt: new Date("2026-08-11T00:00:00Z"),
      })
    ).toEqual({
      action: "skip",
      reason:
        "mandat local confirmé par sa source le 2026-08-11, postérieur au délai d'option du 2026-04-25 : deux sources se contredisent",
    });
  });

  it("ne décide rien sur un vote antérieur au délai", () => {
    // Notre couverture des votes du Sénat s'arrête en juillet 2025 : un dernier vote ancien
    // ne dit pas que la personne a quitté son siège, il dit que nous ne savons pas.
    expect(
      decideCumul({
        localStartDate: DEBUT_MAIRE,
        lastParliamentaryVote: new Date("2025-07-10T00:00:00Z"),
        localConfirmedAt: null,
      })
    ).toEqual({
      action: "skip",
      reason: "dernier vote du 2025-07-10, antérieur au délai d'option du 2026-04-25",
    });
  });

  it("ne décide rien sans aucune preuve", () => {
    expect(
      decideCumul({
        localStartDate: DEBUT_MAIRE,
        lastParliamentaryVote: null,
        localConfirmedAt: null,
      })
    ).toEqual({
      action: "skip",
      reason: "aucun vote parlementaire connu",
    });
  });

  it("ne décide rien tant que le délai d'option court encore", () => {
    // Pendant les 30 jours, le cumul est légal. Fermer le mandat local y serait faux.
    const demain = new Date(Date.now() + 86_400_000);
    expect(
      decideCumul({
        localStartDate: demain,
        lastParliamentaryVote: new Date(),
        localConfirmedAt: null,
      }).action
    ).toBe("skip");
  });
});
