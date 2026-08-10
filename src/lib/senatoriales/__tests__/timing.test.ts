import { describe, it, expect } from "vitest";
import { deriveCandidacyPhase, isBallotDayInParis } from "../timing";
import { CANDIDACY_PERIOD } from "@/config/senatoriales";
import { resolveElectionStatus } from "@/lib/elections/status";
import { getBallotPhase } from "@/app/elections/senatoriales-2026/_content";

/**
 * Les frontières temporelles du hub, à horloge figée.
 *
 * Ce sont les régressions les plus coûteuses : elles ne cassent rien, elles se contentent
 * d'afficher une affirmation fausse pendant quelques heures, une fois, et personne n'est là
 * pour la voir. Chaque instant est donc écrit en heure de Paris et converti explicitement.
 */

/** Paris est à UTC+2 sur tout le mois de septembre 2026 (heure d'été). */
function paris(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 8, day, hour - 2, minute));
}

const ROUND_1 = new Date("2026-09-27T00:00:00Z");

describe("deriveCandidacyPhase : la période de dépôt", () => {
  it("le 6 septembre, le dépôt n'est pas ouvert", () => {
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(6, 12))).toBe("before");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(6, 23, 59))).toBe("before");
  });

  it("le 7 septembre, dès minuit, le dépôt est en cours", () => {
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(7, 0))).toBe("open");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(7, 1))).toBe("open");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(7, 9))).toBe("open");
  });

  /**
   * Le cœur de la correction, et le test qui l'empêche de régresser.
   *
   * L'article 2 fixe 18 h, mais **localement** auprès du représentant de l'État dans la
   * circonscription de dépôt, et l'article 1 convoque des territoires de UTC+12 à UTC-10.
   * Il n'existe donc aucun instant national de clôture. À 18 h à Paris le 11, le dépôt est
   * encore ouvert six heures en Polynésie française : la phase ne doit pas bouger d'un
   * bout à l'autre de cette journée.
   *
   * Ce test échoue si quelqu'un réintroduit une coupure à l'instant, quel qu'il soit.
   */
  it("ne change pas d'état au cours du 11 septembre, faute d'instant national de clôture", () => {
    for (const [hour, minute] of [
      [0, 0],
      [12, 0],
      [17, 59],
      [18, 0],
      [18, 1],
      [23, 59],
    ] as const) {
      expect(
        deriveCandidacyPhase(CANDIDACY_PERIOD, paris(11, hour, minute)),
        `11 septembre ${hour}:${String(minute).padStart(2, "0")} à Paris`
      ).toBe("open");
    }
  });

  it("le 12 septembre, dès minuit, le dépôt du premier tour est terminé", () => {
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(12, 0))).toBe("closed");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(12, 12))).toBe("closed");
  });

  it("le 26, le 27 et le 28 septembre, le dépôt reste terminé", () => {
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(26, 12))).toBe("closed");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(27, 12))).toBe("closed");
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, paris(28, 12))).toBe("closed");
  });

  it("porte les dates de l'article 2 du décret", () => {
    expect(CANDIDACY_PERIOD.firstDay).toBe("2026-09-07");
    expect(CANDIDACY_PERIOD.lastDay).toBe("2026-09-11");
  });
});

describe("deriveCandidacyPhase : données insuffisantes", () => {
  it("dit ne pas savoir sur une borne malformée", () => {
    expect(
      deriveCandidacyPhase({ firstDay: "7 septembre", lastDay: "2026-09-11" }, paris(8, 12))
    ).toBe("unknown");
    expect(deriveCandidacyPhase({ firstDay: "2026-09-07", lastDay: "" }, paris(8, 12))).toBe(
      "unknown"
    );
  });

  it("dit ne pas savoir quand la période se termine avant de commencer", () => {
    expect(
      deriveCandidacyPhase({ firstDay: "2026-09-11", lastDay: "2026-09-07" }, paris(8, 12))
    ).toBe("unknown");
  });

  it("dit ne pas savoir sur une horloge invalide plutôt que de comparer un NaN", () => {
    expect(deriveCandidacyPhase(CANDIDACY_PERIOD, new Date("pas une date"))).toBe("unknown");
  });
});

describe("isBallotDayInParis : le jour du scrutin", () => {
  it("est faux la veille au soir", () => {
    expect(isBallotDayInParis(ROUND_1, paris(26, 23, 59))).toBe(false);
  });

  it("est vrai dès minuit le 27 et jusqu'à 23 h 59", () => {
    expect(isBallotDayInParis(ROUND_1, paris(27, 0))).toBe(true);
    expect(isBallotDayInParis(ROUND_1, paris(27, 12))).toBe(true);
    expect(isBallotDayInParis(ROUND_1, paris(27, 23, 59))).toBe(true);
  });

  it("est faux dès minuit le 28", () => {
    expect(isBallotDayInParis(ROUND_1, paris(28, 0))).toBe(false);
  });

  it("est faux sans date de scrutin", () => {
    expect(isBallotDayInParis(null, paris(27, 12))).toBe(false);
  });
});

/**
 * Les deux axes ensemble.
 *
 * `resolveElectionStatus` traite un jour de scrutin comme les 24 heures qui suivent une
 * date stockée à minuit UTC, soit 2 h du matin à 2 h du matin en heure de Paris. Le
 * raffinement doit rétrécir cette fenêtre, jamais l'élargir : l'état 3 ne doit pas
 * survivre deux heures à son propre jour, et il ne doit pas non plus s'afficher pendant
 * que le reste de la page annonce encore un scrutin à venir.
 */
describe("état 3 : le raffinement ne peut que rétrécir la phase partagée", () => {
  const stored = { status: "UPCOMING" as const, round1Date: ROUND_1, round2Date: null };

  function etat3(now: Date): boolean {
    const phase = getBallotPhase(resolveElectionStatus(stored, now));
    return phase === "polling-day" && isBallotDayInParis(ROUND_1, now);
  }

  it("ne s'affiche pas le 26 septembre", () => {
    expect(etat3(paris(26, 12))).toBe(false);
  });

  it("s'affiche le 27 septembre en journée", () => {
    expect(etat3(paris(27, 12))).toBe(true);
  });

  it("ne s'affiche pas le 28 septembre à 1 h, alors que la phase partagée dit encore ROUND_1", () => {
    const now = paris(28, 1);
    expect(getBallotPhase(resolveElectionStatus(stored, now))).toBe("polling-day");
    expect(etat3(now)).toBe(false);
  });

  it("ne s'affiche pas le 28 septembre en journée", () => {
    expect(etat3(paris(28, 12))).toBe(false);
  });

  /**
   * Entre minuit et 2 h le 27, la phase partagée dit encore « à venir ». Le bloc reste
   * donc masqué : il sous-estime de deux heures au lieu de contredire le haut de la page.
   * C'est le sens du ET, et cette assertion existe pour que le jour où quelqu'un retire le
   * ET, un test le dise.
   */
  it("reste masqué le 27 à 1 h, faute d'accord avec la phase partagée", () => {
    const now = paris(27, 1);
    expect(isBallotDayInParis(ROUND_1, now)).toBe(true);
    expect(getBallotPhase(resolveElectionStatus(stored, now))).toBe("before");
    expect(etat3(now)).toBe(false);
  });
});
