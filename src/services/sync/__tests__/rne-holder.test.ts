import { describe, expect, it, vi } from "vitest";

// `@/lib/identity` re-exports the resolver, which builds the Prisma client at import time.
// Nothing under test touches the database; the unit CI job has no DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import { Judgement } from "@/generated/prisma";

import {
  compareHolder,
  canAdoptByName,
  decidePhase2Action,
  decidePhase1Action,
  describeNameRelation,
  isChronologicallyClosable,
  isFurtherTerm,
  shouldRunStaleSweep,
  type HolderVerdict,
  type Phase1Action,
} from "@/services/sync/rne-holder";

const CIOTTI = { firstName: "Éric", lastName: "Ciotti", birthDate: new Date("1965-09-28") };

describe("compareHolder", () => {
  it("reconnaît la même personne malgré casse et accents", () => {
    expect(
      compareHolder(
        { firstName: "ERIC", lastName: "CIOTTI", birthDate: new Date("1965-09-28") },
        CIOTTI
      )
    ).toBe("SAME");
  });

  it("accepte un nom civil plus long que le nom d'usage", () => {
    // Francheville : le registre donne la particule complète, notre base un nom d'usage.
    // Le nom de famille concorde, c'est le prénom qui décide de la suite.
    expect(
      compareHolder(
        {
          firstName: "Guy",
          lastName: "DE LA POËZE D'HARAMBURE",
          birthDate: new Date("1938-01-07"),
        },
        { firstName: "Guy", lastName: "D'harambure", birthDate: new Date("1938-01-07") }
      )
    ).toBe("SAME");
  });

  it("confirme un titulaire malgré un prénom composé d'un seul côté", () => {
    // Le registre porte les prénoms d'état civil, notre base souvent le prénom d'usage. Le
    // résolveur note ce couple 0.9000, sous AUTO_MATCH, parce qu'il est réglé pour classer des
    // candidats à l'échelle de la France. Ici le nom concorde ET la naissance concorde au jour
    // près : c'est la même personne. Mesuré : 207 lignes de cette forme, aucune avec une
    // naissance différente.
    expect(
      compareHolder(
        {
          firstName: "Guy Raoul",
          lastName: "DE LA POËZE D'HARAMBURE",
          birthDate: new Date("1938-01-07"),
        },
        { firstName: "Guy", lastName: "D'harambure", birthDate: new Date("1938-01-07") }
      )
    ).toBe("SAME");
  });

  it("voit une succession entre deux personnes nées le même jour", () => {
    // La Bourboule : même date de naissance, personne différente.
    expect(
      compareHolder(
        { firstName: "David", lastName: "Dupic", birthDate: new Date("1970-09-14") },
        { firstName: "François", lastName: "Constantin", birthDate: new Date("1970-09-14") }
      )
    ).toBe("DIFFERENT");
  });

  it("refuse de trancher sans date de naissance, et ne ferme donc rien", () => {
    // Beaucoup de profils nationaux n'ont pas de date de naissance en base. Les traiter
    // comme une succession leur retirerait leur mandat sur une date fabriquée.
    expect(compareHolder({ ...CIOTTI, birthDate: null }, CIOTTI)).toBe("UNDECIDED");
    expect(compareHolder(CIOTTI, { ...CIOTTI, birthDate: null })).toBe("UNDECIDED");
  });

  it("voit une succession quand les deux naissances sont connues et diffèrent", () => {
    // Deux dates de naissance connues qui divergent : c'est la seule preuve positive qu'il
    // s'agit de deux personnes. Assertion volontairement stricte, `not.toBe("SAME")` passerait
    // aussi sur UNDECIDED et ne dirait rien du chemin destructif réellement pris.
    expect(compareHolder({ ...CIOTTI, birthDate: new Date("1980-01-01") }, CIOTTI)).toBe(
      "DIFFERENT"
    );
  });

  it("confirme malgré une variante d'orthographe du prénom", () => {
    // "Franck" contre "Frank" : même nom, même naissance. Le signal prénom ne connaît
    // qu'exact ou sous-chaîne, aucune distance d'édition, donc le score tombe à 0.36 et un
    // verdict rendu sur le score seul fermerait le mandat d'un maire en exercice pour publier
    // un doublon. Mesuré le 2026-09-27 : 25 cas sur le registre courant.
    expect(
      compareHolder(
        { firstName: "Franck", lastName: "Burton", birthDate: new Date("1962-03-04") },
        { firstName: "Frank", lastName: "Burton", birthDate: new Date("1962-03-04") }
      )
    ).toBe("SAME");
  });

  it("ne tranche pas sur deux noms sans rapport quand une naissance manque", () => {
    // Le registre est en retard sur les municipales de mars 2026. Sans date de naissance,
    // un nom différent ne suffit pas à retirer son mandat à un maire fraîchement élu.
    // Mesuré : 4 fermetures de maires en place seraient décidées sans aucune naissance.
    expect(
      compareHolder(
        { firstName: "Jean François", lastName: "Siret", birthDate: new Date("1955-02-03") },
        { firstName: "Gaëlle", lastName: "Lamé", birthDate: null }
      )
    ).toBe("UNDECIDED");
  });

  it("confirme malgré un décalage de fuseau sur la naissance", () => {
    // Naissance identique : minuit à Paris d'un côté (23:00Z la veille), midi UTC de l'autre,
    // ce que produit le parseur du registre. Les jours calendaires UTC diffèrent, les jours
    // calendaires à Paris non. 32 366 fiches sont stockées à 23:00Z, aucune à midi.
    expect(
      compareHolder(
        { firstName: "Alice", lastName: "Martin", birthDate: new Date("1970-04-02T12:00:00Z") },
        { firstName: "Alicia", lastName: "Martin", birthDate: new Date("1970-04-01T23:00:00Z") }
      )
    ).toBe("SAME");
  });

  it("ne confirme pas deux patronymes sans rapport quand les naissances divergent", () => {
    // `scoreCandidate` ne compare PAS les noms de famille : resolveBatch pré-filtre les
    // candidats dessus avant de l'appeler. La porte explicite reste indispensable : sans elle,
    // ce couple sortirait SAME à 0.98 sur le seul prénom, alors que rien ne les rapproche.
    expect(
      compareHolder(
        { firstName: "Jean", lastName: "Martin", birthDate: new Date("1960-05-03") },
        { firstName: "Jean", lastName: "Bernard", birthDate: new Date("1975-11-20") }
      )
    ).toBe("DIFFERENT");
  });

  it("reconnaît un nom d'usage contre un nom de naissance", () => {
    // Même prénom, même jour de naissance, patronyme sans rapport, même commune : c'est un nom
    // marital, pas deux personnes. Mesuré le 2026-09-27 : 59 lignes de cette forme. Les tenir
    // pour indécises gelait leur mandat sans jamais rien trancher ; conclure à une succession
    // aurait fermé leur mandat et publié la même personne sous chacun de ses deux noms.
    //
    // Ce que ce verdict NE règle PAS : la fiche garde le nom que nous détenons déjà, et reste
    // introuvable sous l'autre. `Politician` n'a pas de champ d'alias.
    expect(
      compareHolder(
        { firstName: "Karine", lastName: "Palle", birthDate: new Date("1972-07-26") },
        { firstName: "Karine", lastName: "Paret", birthDate: new Date("1972-07-26") }
      )
    ).toBe("SAME");
  });

  it("voit une succession quand le prénom et le patronyme diffèrent", () => {
    // La Bourboule : "David Denis Dominique Dupic" contre "François Constantin", même jour de
    // naissance. Deux noms sans rapport et deux prénoms sans rapport, c'est une vraie
    // succession, et le mandat du prédécesseur doit se fermer.
    expect(
      compareHolder(
        {
          firstName: "David Denis Dominique",
          lastName: "Dupic",
          birthDate: new Date("1970-09-14"),
        },
        { firstName: "François", lastName: "Constantin", birthDate: new Date("1970-09-14") }
      )
    ).toBe("DIFFERENT");
  });

  it("ne tranche pas sur un nom de famille manquant", () => {
    // DIFFERENT déclencherait une fermeture suivie d'une création. Une information absente
    // ne peut pas produire ça.
    expect(compareHolder({ ...CIOTTI, lastName: null }, CIOTTI)).toBe("UNDECIDED");
  });

  it("ne confond pas deux noms dont l'un est un préfixe de l'autre, sans pour autant trancher", () => {
    // "MARTINEZ" contient "MARTIN" comme sous-chaîne, mais pas comme mot. Répondre DIFFERENT
    // fermerait un mandat et en créerait un autre sur une ressemblance douteuse.
    expect(
      compareHolder(
        { firstName: "Jean", lastName: "Martinez", birthDate: new Date("1960-05-03") },
        { firstName: "Jean", lastName: "Martin", birthDate: new Date("1960-05-03") }
      )
    ).toBe("UNDECIDED");
  });

  it("refuse de fermer un mandat avant son propre début", () => {
    // Un registre en retard nommerait encore l'ancien maire : fermer le mandat 2026 à la date
    // de prise de fonction d'un mandat antérieur produirait une fin avant le début.
    expect(isChronologicallyClosable(new Date("2026-03-26"), new Date("2020-05-24"))).toBe(false);
    expect(isChronologicallyClosable(new Date("2020-05-24"), new Date("2026-03-26"))).toBe(true);
  });

  it("reconnaît une particule recollée", () => {
    // "DE LA TOUR" et "DELATOUR" sont une seule personne. Les séparer fermerait son mandat
    // pour en recréer un identique à côté.
    expect(
      compareHolder(
        { firstName: "Jean-Marie", lastName: "De La Tour", birthDate: new Date("1950-01-02") },
        { firstName: "JEAN MARIE", lastName: "DELATOUR", birthDate: new Date("1950-01-02") }
      )
    ).toBe("SAME");
  });
});

const SAME = { verdict: "SAME" as HolderVerdict, closable: true };
const UNDECIDED = { verdict: "UNDECIDED" as HolderVerdict, closable: true };
const DIFFERENT = { verdict: "DIFFERENT" as HolderVerdict, closable: true };
const DIFFERENT_STALE = { verdict: "DIFFERENT" as HolderVerdict, closable: false };

describe("decidePhase1Action", () => {
  const CASES: [string, Parameters<typeof decidePhase1Action>[0], Phase1Action][] = [
    // Un mandat RNE existe : c'est lui qui décide, l'incumbent n'est même pas consulté.
    [
      "RNE même titulaire",
      { existing: SAME, hasCommuneId: true, incumbent: null, priorTerm: null },
      "update",
    ],
    [
      "RNE succession",
      { existing: DIFFERENT, hasCommuneId: true, incumbent: null, priorTerm: null },
      "close-and-create",
    ],
    [
      "RNE succession, registre en retard",
      { existing: DIFFERENT_STALE, hasCommuneId: true, incumbent: null, priorTerm: null },
      "skip",
    ],
    [
      "RNE indécis",
      { existing: UNDECIDED, hasCommuneId: true, incumbent: null, priorTerm: null },
      "skip",
    ],

    // Pas de mandat RNE : on regarde qui tient la commune sous une autre source.
    [
      "aucun mandat, aucune commune résolue",
      { existing: null, hasCommuneId: false, incumbent: null, priorTerm: null },
      "create",
    ],
    [
      "aucun mandat, commune résolue, personne en place",
      { existing: null, hasCommuneId: true, incumbent: null, priorTerm: null },
      "create",
    ],
    [
      "titulaire MUNICIPALES, même personne",
      { existing: null, hasCommuneId: true, incumbent: SAME, priorTerm: null },
      "adopt",
    ],
    [
      "titulaire MUNICIPALES, personne différente",
      { existing: null, hasCommuneId: true, incumbent: DIFFERENT, priorTerm: null },
      "close-incumbent-and-create",
    ],
    [
      "titulaire MUNICIPALES, registre en retard",
      { existing: null, hasCommuneId: true, incumbent: DIFFERENT_STALE, priorTerm: null },
      "skip",
    ],
    [
      "titulaire MUNICIPALES, indécis",
      { existing: null, hasCommuneId: true, incumbent: UNDECIDED, priorTerm: null },
      "skip",
    ],

    // Commune non résolue : aucune recherche de titulaire n'est sûre, donc on crée.
    [
      "commune non résolue malgré un titulaire",
      { existing: null, hasCommuneId: false, incumbent: SAME, priorTerm: null },
      "create",
    ],

    // Personne en place : un mandat clos peut nous dire que nous détenons déjà la personne.
    [
      "mandat clos, même personne, mandat postérieur",
      {
        existing: null,
        hasCommuneId: true,
        incumbent: null,
        priorTerm: { verdict: "SAME" as HolderVerdict, furtherTerm: true },
      },
      "new-term",
    ],
    [
      "mandat clos, même personne, registre en retard",
      {
        existing: null,
        hasCommuneId: true,
        incumbent: null,
        priorTerm: { verdict: "SAME" as HolderVerdict, furtherTerm: false },
      },
      "skip",
    ],
    [
      "mandat clos, autre personne",
      {
        existing: null,
        hasCommuneId: true,
        incumbent: null,
        priorTerm: { verdict: "DIFFERENT" as HolderVerdict, furtherTerm: true },
      },
      "create",
    ],
    [
      "mandat clos, identité incertaine",
      {
        existing: null,
        hasCommuneId: true,
        incumbent: null,
        priorTerm: { verdict: "UNDECIDED" as HolderVerdict, furtherTerm: true },
      },
      "skip",
    ],
    [
      "maire en place prioritaire sur le mandat clos",
      {
        existing: null,
        hasCommuneId: true,
        incumbent: SAME,
        priorTerm: { verdict: "SAME" as HolderVerdict, furtherTerm: true },
      },
      "adopt",
    ],
    [
      "commune non résolue, mandat clos de la même personne",
      {
        existing: null,
        hasCommuneId: false,
        incumbent: null,
        priorTerm: { verdict: "SAME" as HolderVerdict, furtherTerm: true },
      },
      "new-term",
    ],
  ];

  it.each(CASES)("%s", (_label, input, expected) => {
    expect(decidePhase1Action(input)).toBe(expected);
  });

  it("n'écrit jamais sur un doute", () => {
    // Tout UNDECIDED, où qu'il apparaisse, doit mener à skip. C'est l'invariant que les
    // révisions successives ont cassé trois fois.
    const doubts = CASES.filter(
      ([, input]) =>
        input.existing?.verdict === "UNDECIDED" ||
        input.incumbent?.verdict === "UNDECIDED" ||
        // Un mandat clos dont on ne sait pas s'il est de la même personne : créer publierait
        // une seconde fiche d'une personne réelle, et la Phase 2 ne la rattraperait pas
        // puisqu'elle pré-filtre par nom de famille, qui est justement ce qui diffère.
        input.priorTerm?.verdict === "UNDECIDED"
    );

    expect(doubts.length).toBeGreaterThan(0);
    for (const [, input] of doubts) expect(decidePhase1Action(input)).toBe("skip");
  });
});

describe("shouldRunStaleSweep", () => {
  it("ne balaie pas sur un aperçu limité", () => {
    // Phase 3 ferme les mandats dont la commune a quitté le fichier. Avec `--limit`, le
    // fichier lu est tronqué, donc « absent du fichier » veut dire « au-delà de la limite » :
    // mesuré le 2026-09-27, `--dry-run --limit=100` annonçait 21 592 fermetures.
    expect(shouldRunStaleSweep({ limit: 100 })).toBe(false);
    expect(shouldRunStaleSweep({ limit: 0 })).toBe(false);
  });

  it("balaie sur un fichier entier", () => {
    expect(shouldRunStaleSweep({})).toBe(true);
    expect(shouldRunStaleSweep({ limit: undefined })).toBe(true);
  });
});

describe("isFurtherTerm", () => {
  it("reconnaît une réélection", () => {
    // Mandat 2020 clos en mars 2026, le registre ouvre au 20 mars 2026. La fermeture est
    // datée du 26 : les intervalles se chevauchent de six jours, donc comparer à la date de
    // fin rejetterait 1 526 réélections sur 1 607. C'est le DÉBUT qui discrimine.
    expect(isFurtherTerm(new Date("2020-05-24"), new Date("2026-03-20"))).toBe(true);
  });

  it("reconnaît une prise de fonction en cours de mandat suivie d'une réélection", () => {
    // Le cas réel le plus serré mesuré : 130 jours (03214, Sébastien Arnaud).
    expect(isFurtherTerm(new Date("2025-11-13"), new Date("2026-03-23"))).toBe(true);
  });

  it("refuse un registre qui répète le mandat que nous avons déjà clos", () => {
    // `reconcile-municipales` ne crée un successeur qu'au-dessus de 1 000 habitants. En
    // dessous, la commune se retrouve sans maire, et un registre en retard nommant encore
    // l'ancien ressusciterait son mandat, chevauchant celui qu'on vient de fermer.
    expect(isFurtherTerm(new Date("2020-05-24"), new Date("2020-05-24"))).toBe(false);
    expect(isFurtherTerm(new Date("2020-05-24"), new Date("2020-05-26"))).toBe(false);
    expect(isFurtherTerm(new Date("2020-05-24"), new Date("2020-03-01"))).toBe(false);
  });
});

describe("decidePhase2Action", () => {
  it("fusionne quand l'identité est confirmée", () => {
    expect(decidePhase2Action(Judgement.SAME)).toBe("merge");
  });

  it("met en brouillon sur un doute plutôt que de publier un doublon", () => {
    // Mesuré le 2026-09-27 : 2 647 fiches sur 12 004. Le résolveur dit qu'elles pourraient
    // doubler quelqu'un que nous détenons déjà, et rien ne le signalait : la Phase 2 les
    // laissait publiées et ne les comptait même pas dans son rapport.
    expect(decidePhase2Action(Judgement.UNDECIDED)).toBe("draft");
  });

  it("laisse publiée une fiche que rien ne rapproche d'une autre", () => {
    // 9 262 maires sans homonyme en base. Ce sont de nouvelles personnes, pas des doutes.
    expect(decidePhase2Action(null)).toBe("keep");
    expect(decidePhase2Action(Judgement.NOT_SAME)).toBe("keep");
    // `ResolveResult.decision` porte un quatrième état hors de l'enum Prisma.
    expect(decidePhase2Action("NEW")).toBe("keep");
  });
});

describe("canAdoptByName", () => {
  const SANS_NAISSANCE = { firstName: "Alice", lastName: "Martin", birthDate: null };
  const REGISTRE = { firstName: "Alice", lastName: "MARTIN", birthDate: new Date("1970-04-02") };

  function adopt(over: Partial<Parameters<typeof canAdoptByName>[0]> = {}): boolean {
    return canAdoptByName({
      verdict: "UNDECIDED",
      incoming: REGISTRE,
      current: SANS_NAISSANCE,
      uniqueRegisterRow: true,
      ...over,
    });
  }

  it("adopte sur un nom complet identique quand notre fiche n'a pas de naissance", () => {
    // 1 177 maires issus des municipales 2026 sont dans ce cas. Dans une commune donnée, à un
    // instant donné, un nom complet exact identifie une personne.
    expect(adopt()).toBe(true);
  });

  it("ne s'applique pas quand notre fiche porte une naissance", () => {
    // Là, `compareHolder` a des preuves et son verdict fait foi, dans un sens comme dans l'autre.
    expect(adopt({ current: { ...SANS_NAISSANCE, birthDate: new Date("1970-04-02") } })).toBe(
      false
    );
  });

  it("n'écrase jamais un verdict rendu sur preuves", () => {
    expect(adopt({ verdict: "DIFFERENT" })).toBe(false);
    expect(adopt({ verdict: "SAME" })).toBe(false);
  });

  it("exige l'égalité, pas l'inclusion", () => {
    // "Guy" contre "Guy Raoul", "D'harambure" contre "De La Poëze D'harambure" : c'est
    // probablement la même personne, mais « probablement » ne suffit pas pour écrire.
    expect(adopt({ incoming: { ...REGISTRE, firstName: "Alice Marie" } })).toBe(false);
    expect(adopt({ incoming: { ...REGISTRE, lastName: "De La Martin" } })).toBe(false);
  });

  it("tolère la ponctuation et les accents, qui ne changent pas l'identité", () => {
    expect(
      adopt({
        incoming: { ...REGISTRE, firstName: "ALICE", lastName: "Martin" },
        current: { firstName: "Alice", lastName: "MARTIN", birthDate: null },
      })
    ).toBe(true);
    expect(
      adopt({
        incoming: { ...REGISTRE, lastName: "Dupont-Aignan" },
        current: { firstName: "Alice", lastName: "Dupont Aignan", birthDate: null },
      })
    ).toBe(true);
  });

  it("refuse quand le registre décrit la commune deux fois", () => {
    // Le parseur garde la dernière ligne et jette l'autre. Un nom ne peut plus désigner
    // personne quand la source elle-même se contredit sur la commune.
    expect(adopt({ uniqueRegisterRow: false })).toBe(false);
  });

  it("refuse sur un nom vide d'un côté", () => {
    expect(adopt({ current: { firstName: "", lastName: "Martin", birthDate: null } })).toBe(false);
    expect(adopt({ current: { firstName: "Alice", lastName: null, birthDate: null } })).toBe(false);
  });
});

describe("describeNameRelation", () => {
  it("distingue l'égalité stricte de la simple compatibilité", () => {
    // `canAdoptByName` exige l'égalité, `compareHolder` se contente de l'inclusion. Un seul
    // mot pour les deux ferait dire au CSV que la règle aurait dû s'appliquer alors qu'elle
    // ne le pouvait pas : 4 communes sont dans ce cas.
    expect(describeNameRelation("Philippe", "Philippe")).toBe("identique");
    expect(describeNameRelation("Philippe", "Philippe Pierre")).toBe("compatible");
  });

  it("nomme aussi le doute et le désaccord", () => {
    expect(describeNameRelation("Martin", "Martinez")).toBe("incertain");
    expect(describeNameRelation("Martin", "Bernard")).toBe("diffère");
  });

  it("ignore ponctuation et accents, qui ne changent pas un nom", () => {
    expect(describeNameRelation("Dupont-Aignan", "Dupont Aignan")).toBe("identique");
    expect(describeNameRelation("ERIC", "Éric")).toBe("identique");
  });
});
