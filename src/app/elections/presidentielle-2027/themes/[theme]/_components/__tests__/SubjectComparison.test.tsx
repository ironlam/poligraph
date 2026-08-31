import { render, screen, within } from "@testing-library/react";
import { VOTE_RELATION_BASIS_LABELS } from "@/config/labels";
import { describe, expect, it } from "vitest";
import type { PublicMeasure } from "@/lib/data/measures";
import type { SubjectCandidateEntry, SubjectPageData } from "@/lib/data/subject-page";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import { SubjectComparison } from "../SubjectComparison";

function measure(over: Partial<PublicMeasure> = {}): PublicMeasure {
  return {
    id: "m-1",
    slug: "camille-riviere-encadrer-les-loyers",
    publishedRevisionId: "rev-1",
    text: "Encadrer les loyers.",
    details: null,
    reviewedAt: new Date("2027-01-16T00:00:00Z"),
    precision: "OBJECTIF_SANS_CHIFFRE",
    theme: "LOGEMENT_URBANISME",
    attribution: "PERSONAL",
    politicianId: "p-1",
    candidacyId: "c-1",
    programEditionId: null,
    withdrawal: null,
    sources: [],
    qualifications: [],
    subtopics: [],
    ...over,
  };
}

function source(
  over: Partial<PublicMeasure["sources"][number]> = {}
): PublicMeasure["sources"][number] {
  return {
    id: "s-1",
    measureRevisionId: "rev-1",
    sourceKind: "PROGRAMME_PARTI",
    tier: "PRIMARY",
    url: "https://example.org/programme.pdf",
    page: null,
    publishedAt: new Date("2027-01-15T00:00:00Z"),
    createdAt: new Date("2027-01-16T00:00:00Z"),
    ...over,
  };
}

function candidate(
  name: string,
  over: Partial<SubjectCandidateEntry["candidate"]> = {}
): SubjectCandidateEntry["candidate"] {
  return {
    id: `cand-${name}`,
    candidateName: name,
    politicianSlug: null,
    status: "DECLARE",
    sourceUrl: null,
    sourceLabel: null,
    slogan: null,
    accentColor: null,
    partyLabel: "Parti Fixture",
    partyShortName: "PF",
    declaredAt: null,
    ...over,
  };
}

function entry(
  name: string,
  measures: SubjectCandidateEntry["measures"],
  candidateOver: Partial<SubjectCandidateEntry["candidate"]> = {}
): SubjectCandidateEntry {
  return { candidate: candidate(name, candidateOver), measures };
}

function subjectMeasure(
  m: PublicMeasure,
  relation: VoteRelation
): SubjectCandidateEntry["measures"][number] {
  return { measure: m, voteRelation: relation, voteReference: null };
}

function data(over: Partial<SubjectPageData> = {}): SubjectPageData {
  return {
    theme: "LOGEMENT_URBANISME",
    electionSlug: "presidentielle-2027",
    candidates: [],
    candidaciesWithVerifiedMeasure: 2,
    publishable: true,
    requiredCandidaciesWithVerifiedMeasure: 2,
    totalSourcedCandidacies: 3,
    pendingReviewRevisionCount: 0,
    lastReviewedAt: null,
    fallbackPublishableTheme: null,
    siblingThemes: [
      {
        theme: "LOGEMENT_URBANISME",
        label: "Logement & Urbanisme",
        slug: "logement-urbanisme",
        measureCount: 4,
        publishable: true,
      },
      { theme: "SANTE", label: "Santé", slug: "sante", measureCount: 0, publishable: false },
    ],
    totalMeasuresOnTheme: 4,
    ...over,
  };
}

describe("SubjectComparison", () => {
  it("annonce le critère de tri réellement appliqué", () => {
    render(<SubjectComparison data={data()} />);
    expect(screen.getByText(/Classées par nom de famille/)).toBeInTheDocument();
  });

  it("rend une absence qualifiée, jamais une cellule vide, pour un candidat sans mesure", () => {
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-a" }), "SEARCH_NOT_DONE")]),
            entry("Chloe", []),
          ],
        })}
      />
    );
    const absence = container.querySelector('[data-absence-kind="no_measure_published"]');
    expect(absence).not.toBeNull();
  });

  it("garde une mesure retirée visible, avec sa source quand les deux champs sont là", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({
                  id: "m-w",
                  text: "Geler les loyers.",
                  withdrawal: {
                    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
                    sourceUrl: "https://example.org/retrait",
                    sourceLabel: "Communiqué de retrait",
                  },
                }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );
    // Deux rendus : le tableau au-dessus de lg, les cartes en dessous. Les deux doivent porter
    // le retrait, sinon un lecteur mobile verrait une mesure abandonnée comme encore défendue.
    expect(screen.getAllByText(/Mesure retirée le/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Communiqué de retrait" })).toHaveLength(2);
  });

  it("n'affiche pas de lien de source de retrait quand le libellé manque", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({
                  id: "m-w2",
                  withdrawal: {
                    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
                    sourceUrl: "https://example.org/retrait",
                    sourceLabel: null,
                  },
                }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );
    expect(screen.getAllByText(/Mesure retirée le/)).toHaveLength(2);
    // Le lien de retrait n'apparaît pas. Les autres liens de la page (sources, sujets, méthode)
    // ne sont pas concernés, d'où la portée sur le paragraphe de retrait lui-même.
    for (const ligne of screen.getAllByText(/Mesure retirée le/)) {
      expect(ligne.querySelector("a")).toBeNull();
    }
  });

  it("rend un état explicite sous le seuil, sans comparaison à un seul candidat", () => {
    render(
      <SubjectComparison
        data={data({
          publishable: false,
          candidaciesWithVerifiedMeasure: 1,
          candidates: [entry("Alix", [subjectMeasure(measure(), "SEARCH_NOT_DONE")])],
        })}
      />
    );
    expect(screen.getByText(/Comparaison pas encore disponible/i)).toBeInTheDocument();
    // Under the gate, no candidate column is rendered at all.
    expect(screen.queryByRole("heading", { level: 2, name: "Alix" })).not.toBeInTheDocument();
  });

  it("rend le libellé de base de la relation aux votes", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-x" }), "NO_VOTE_IN_SCOPE")]),
            entry("Bruno", [subjectMeasure(measure({ id: "m-y" }), "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );
    // La fixture n'a pas de slug de politicien, donc le nom est un texte et non un lien.
    const ligne = screen.getAllByText("Alix")[0]!.closest("tr");
    expect(
      within(ligne as HTMLElement).getByText(/Vote au Parlement vérifié, aucun scrutin proche/)
    ).toBeInTheDocument();
  });

  it("affiche les preuves d'une mesure : source cliquable, nature, niveau et date", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(measure({ id: "m-s", sources: [source()] }), "SEARCH_NOT_DONE"),
            ]),
          ],
        })}
      />
    );
    // Deux rendus, tableau et cartes : la preuve doit tenir dans les deux.
    const liens = screen.getAllByRole("link", { name: "Programme de parti" });
    expect(liens).toHaveLength(2);
    for (const lien of liens) {
      expect(lien).toHaveAttribute("href", "https://example.org/programme.pdf");
      const li = lien.closest("li");
      expect(li).toHaveTextContent("Source primaire");
      expect(li).toHaveTextContent(/janvier 2027/);
    }
  });

  it("rend la source de déclaration de la candidature depuis sa colonne", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure(), "SEARCH_NOT_DONE")], {
              sourceUrl: "https://example.org/annonce",
              sourceLabel: "Discours du 1er mars",
            }),
          ],
        })}
      />
    );
    // La source de déclaration n'est plus répétée par ligne : six libellés de cent caractères
    // écrasaient la première colonne. La page dit que le statut est sourcé et renvoie au champ,
    // qui porte la source de chaque candidature.
    expect(screen.queryByRole("link", { name: "Discours du 1er mars" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir les sources de candidature/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027#candidatures"
    );
  });

  it("n'affirme rien sur la carrière d'un candidat sans mesure sur le sujet", () => {
    // Régression : la cellule vote rendait « N'a jamais siégé » dès que le thème était vide, une
    // affirmation sur un parcours déduite de l'absence de mesure sur UN sujet. Faux pour tous ceux
    // qui ont siégé, et indéductible de ce que cette page lit.
    const { container } = render(
      <SubjectComparison data={data({ candidates: [entry("Chloe", [])] })} />
    );

    expect(container.querySelector('[data-absence-kind="never_sat"]')).toBeNull();
    expect(screen.queryByText(/jamais siégé/i)).not.toBeInTheDocument();
    // Ce que la ligne dit à la place, tableau et carte : l'absence porte sur ce sujet, rien d'autre.
    expect(container.querySelectorAll('[data-absence-kind="no_measure_published"]')).toHaveLength(
      2
    );
    expect(screen.getAllByText(/Aucune mesure publiée sur Logement/).length).toBe(2);
  });

  it("ne rend aucun état de précision sur une mesure publiée", () => {
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ precision: "CHIFFREE" }), "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );

    expect(container.querySelector("[data-measure-precision]")).toBeNull();
    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(screen.queryByText("Objectif non quantifié")).not.toBeInTheDocument();
  });

  it("ne compte pas une mesure retirée comme une mesure portée", () => {
    // `entry.measures` inclut volontairement les retraits. Une candidature dont tout est retiré ne
    // « porte » plus rien, et le compteur de l'autorité (candidaciesWithVerifiedMeasure) est seul
    // à faire cette distinction.
    const retiree = measure({
      id: "m-out",
      withdrawal: {
        withdrawnAt: new Date("2027-03-01T00:00:00Z"),
        sourceUrl: null,
        sourceLabel: null,
      },
    });
    render(
      <SubjectComparison
        data={data({
          candidaciesWithVerifiedMeasure: 1,
          totalMeasuresOnTheme: 1,
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-in" }), "SEARCH_NOT_DONE")]),
            entry("Chloe", [subjectMeasure(retiree, "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );

    // Une seule candidature porte encore une mesure, pas deux.
    expect(screen.getByText(/1 candidature porte une mesure sur ce thème/)).toBeInTheDocument();
    expect(screen.getByText(/réparties entre 1 candidature/)).toBeInTheDocument();
    // Et sous le nom de celle dont la mesure est retirée, le compte tombe à zéro.
    expect(screen.getAllByText(/aucune mesure sur ce thème/).length).toBe(2);
  });

  it("cite jusqu'à trois mesures et ne replie que les suivantes", () => {
    // La régression que ce test verrouille : une seule mesure était citée, et c'était `measures[0]`
    // d'un `orderBy: createdAt asc`, donc celle importée en premier. Un artefact de pipeline
    // présenté comme un choix éditorial.
    const quatre = [1, 2, 3, 4].map((n) =>
      subjectMeasure(measure({ id: `m-${n}`, text: `Mesure ${n}.` }), "SEARCH_NOT_DONE")
    );
    render(<SubjectComparison data={data({ candidates: [entry("Alix", quatre)] })} />);

    // Trois citées d'emblée, dans les deux rendus.
    for (const n of [1, 2, 3]) {
      expect(screen.getAllByText(new RegExp(`Mesure ${n}\\.`))).toHaveLength(2);
    }
    // La quatrième est repliée : présente dans le DOM (le `<details>` reste indexable et
    // opérable au clavier), annoncée pour ce qu'elle est.
    expect(screen.getAllByText("Lire la dernière mesure sur ce thème")).toHaveLength(2);
    expect(screen.getAllByText(/Mesure 4\./)).toHaveLength(2);
  });

  it("n'appelle aucune graisse que la fonte de texte ne publie pas", () => {
    // La régression que ce test verrouille : Atkinson Hyperlegible est chargée en 400 et 700, les
    // deux seules graisses de la famille. Le navigateur rabat 500 sur 400 et 600 sur 700, donc
    // `font-medium` rendait une pastille en maigre et `font-semibold` rendait le lien de source
    // aussi gras que le nom de la candidature. Quatre niveaux appelés, deux rendus, et une
    // hiérarchie inversée. La fonte d'affichage (Outfit) publie 700 et 800 et n'est pas concernée.
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({ id: "m-1", sources: [source()], precision: "CHIFFREE" }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );

    // Et l'état fermé aussi : la carte de publication n'est pas rendue par le cas publiable.
    const { container: ferme } = render(<SubjectComparison data={data({ publishable: false })} />);

    for (const racine of [container, ferme]) {
      const fantomes = [...racine.querySelectorAll<HTMLElement>("[class]")].filter((el) => {
        const classes = el.className.toString();
        return (
          !classes.includes("font-display") &&
          (classes.includes("font-medium") || classes.includes("font-semibold"))
        );
      });
      expect(fantomes.map((el) => el.className.toString())).toEqual([]);
    }
  });

  it("bride la longueur de ligne de la mesure et ne laisse plus la source la surclasser", () => {
    // Deux défauts d'un coup. La colonne souple n'avait pas de largeur propre : sur un grand écran
    // la mesure s'étalait sur environ 990 px, soit 120 à 130 caractères là où la bande lisible est
    // 45 à 75. Et le lien de source, seul élément gras de la carte, pesait plus que la phrase qu'il
    // source.
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({ id: "m-1", text: "Encadrer les loyers.", sources: [source()] }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );

    const phrase = screen.getAllByText(/Encadrer les loyers\./)[0]!;
    expect(phrase.closest("[class*='max-w-']")).not.toBeNull();

    for (const lien of screen.getAllByRole("link", { name: "Programme de parti" })) {
      const classes = lien.className.toString();
      expect(classes).not.toMatch(/font-(bold|semibold|medium|extrabold)/);
      // Le soulignement reste : la couleur ne porte jamais seule l'affordance du lien.
      expect(classes).toContain("underline");
    }
  });

  it("relie chaque mesure citée à sa fiche Poligraph sur ordinateur et mobile", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({ id: "m-linked", text: "Construire des logements." }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );

    const liens = screen.getAllByRole("link", { name: /Construire des logements/ });
    expect(liens).toHaveLength(2);
    for (const lien of liens) {
      expect(lien).toHaveAttribute(
        "href",
        "/elections/presidentielle-2027/mesures/camille-riviere-encadrer-les-loyers"
      );
    }
  });

  it("ne dit qu'une fois qu'une candidature ne porte aucune mesure", () => {
    // La carte la plus vide était la plus répétitive : « aucune mesure sur ce sujet » sous le nom,
    // puis « Aucune mesure publiée sur ... » juste en dessous, pour tout contenu.
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-1" }), "SEARCH_NOT_DONE")]),
            entry("Chloe", []),
          ],
        })}
      />
    );

    expect(screen.queryByText(/aucune mesure sur ce thème/)).not.toBeInTheDocument();
    // La phrase qui reste est celle qui nomme le thème, donc la plus informative des deux.
    expect(screen.getAllByText(/Aucune mesure publiée sur Logement/)).toHaveLength(2);
  });

  it("garde la distinction entre une mesure retirée et aucune mesure", () => {
    // Le doublon levé au-dessus ne doit pas emporter ce cas : une candidature dont tout est retiré
    // porte bien des mesures à l'écran, et « aucune mesure sur ce sujet » y dit autre chose.
    const retiree = measure({
      id: "m-out",
      withdrawal: {
        withdrawnAt: new Date("2027-03-01T00:00:00Z"),
        sourceUrl: null,
        sourceLabel: null,
      },
    });
    render(
      <SubjectComparison
        data={data({
          candidaciesWithVerifiedMeasure: 0,
          candidates: [entry("Chloe", [subjectMeasure(retiree, "SEARCH_NOT_DONE")])],
        })}
      />
    );

    expect(screen.getAllByText(/aucune mesure sur ce thème/)).toHaveLength(2);
  });

  it("explique les mentions après les résultats, avec les libellés réels", () => {
    // La mention est l'état d'un rapprochement en cours ; rien sur la page ne disait que ce travail
    // existait, donc « à vérifier » sous une mesure pouvait passer pour une réserve sur la
    // candidature plutôt que sur notre couverture. La légende cite les libellés depuis la source de
    // vérité : un libellé changé sans elle laisserait une clé qui ne correspond à rien.
    render(
      <SubjectComparison
        data={data({
          candidates: [entry("Alix", [subjectMeasure(measure({ id: "m-1" }), "SEARCH_NOT_DONE")])],
        })}
      />
    );

    const summary = screen.getByText("Comprendre les mentions sous les mesures");
    const legende = summary.closest("details");
    expect(legende).not.toBeNull();
    if (legende === null) throw new Error("Guide des mentions introuvable");
    expect(within(legende).getByText(/rapprochons chaque mesure des scrutins/)).toBeInTheDocument();
    for (const libelle of [
      VOTE_RELATION_BASIS_LABELS.SEARCH_NOT_DONE,
      VOTE_RELATION_BASIS_LABELS.NO_VOTE_IN_SCOPE,
    ]) {
      expect(legende.textContent).toContain(libelle);
    }

    // Le contenu utile arrive avant la méthode, qui reste disponible à la demande.
    const tableau = screen.getByRole("table");
    expect(
      tableau.compareDocumentPosition(legende) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("rend les mesures repliées comme les autres, sans bloc indenté qui casse la lecture", () => {
    // Régression : les mesures dépliées vivaient dans un `border-l-2 pl-3`, une citation dans la
    // citation. Ouvrir le repli coupait la lecture d'une candidature en deux blocs de mise en forme
    // différente, alors que la coupure entre les deux n'est qu'une limite d'affichage.
    const cinq = [1, 2, 3, 4, 5].map((n) =>
      subjectMeasure(measure({ id: `m-${n}`, text: `Mesure ${n}.` }), "SEARCH_NOT_DONE")
    );
    const { container } = render(
      <SubjectComparison data={data({ candidates: [entry("Alix", cinq)] })} />
    );

    // Le repli des mesures, pas celui de la barre latérale des sujets.
    const details = [...container.querySelectorAll("details")].filter((d) =>
      d.textContent?.includes("Replier ces 2 mesures")
    );
    expect(details).toHaveLength(2);
    for (const bloc of details) {
      expect(bloc.querySelector(".border-l-2")).toBeNull();
      expect(bloc.querySelector(".pl-3")).toBeNull();
    }
    // Et le repli propose les deux sens : sans « Replier », les mesures ouvertes n'ont plus de
    // chemin de retour visible vers la forme courte.
    expect(screen.getAllByText("Lire les 2 autres mesures sur ce thème")).toHaveLength(2);
    expect(screen.getAllByText("Replier ces 2 mesures")).toHaveLength(2);
  });

  it("ne replie rien quand la candidature porte trois mesures ou moins", () => {
    const trois = [1, 2, 3].map((n) =>
      subjectMeasure(measure({ id: `m-${n}`, text: `Mesure ${n}.` }), "SEARCH_NOT_DONE")
    );
    render(<SubjectComparison data={data({ candidates: [entry("Alix", trois)] })} />);

    expect(screen.queryByText(/Lire la dernière mesure sur ce thème/)).not.toBeInTheDocument();
    expect(screen.queryByText(/autres mesures sur ce thème/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Replier/)).not.toBeInTheDocument();
  });

  it("rattache chaque état de vote à la mesure citée sans afficher sa précision", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({
                  id: "m-1",
                  text: "Construire 200 000 logements.",
                  precision: "CHIFFREE",
                }),
                "SEARCH_NOT_DONE"
              ),
              subjectMeasure(
                measure({ id: "m-2", text: "Encadrer les loyers.", precision: null }),
                "NO_VOTE_IN_SCOPE"
              ),
            ]),
          ],
        })}
      />
    );

    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(screen.queryByText("Précision non renseignée")).not.toBeInTheDocument();
    // Deux états de vote différents restent associés aux deux mesures. Portée sur la ligne du tableau : le
    // paragraphe de méthode cite les mêmes libellés en bas de page.
    const ligne = screen.getAllByText("Alix")[0]!.closest("tr") as HTMLElement;
    expect(within(ligne).getAllByText(/Vote au Parlement à vérifier/)).toHaveLength(1);
    expect(
      within(ligne).getAllByText(/Vote au Parlement vérifié, aucun scrutin proche/)
    ).toHaveLength(1);
  });

  it("porte le code couleur de chaque candidature, dans le tableau comme sur les cartes", () => {
    // Régression : la pastille existait mais n'était alimentée que par l'accent éditorial, nul sur
    // toutes les candidatures semées, donc chaque ligne rendait le même gris. La couleur est
    // désormais résolue par l'autorité de lecture (`resolveCandidateAccentColor`).
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-1" }), "SEARCH_NOT_DONE")], {
              accentColor: "#cc2443",
            }),
            entry("Chloe", [subjectMeasure(measure({ id: "m-2" }), "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );

    // Deux rendus, tableau et cartes : la pastille doit tenir dans les deux.
    const colorees = container.querySelectorAll('[data-accent="#cc2443"]');
    expect(colorees).toHaveLength(2);
    for (const pastille of colorees) {
      expect(pastille).toHaveStyle({ backgroundColor: "#cc2443" });
      // Décorative : le nom du parti est écrit à côté, la couleur ne porte jamais seule un fait.
      expect(pastille).toHaveAttribute("aria-hidden", "true");
    }

    // Sans couleur résolue, la pastille reste neutre plutôt que d'emprunter celle d'un autre parti.
    const neutres = container.querySelectorAll('[data-accent="neutre"]');
    expect(neutres).toHaveLength(2);
    for (const pastille of neutres) {
      expect((pastille as HTMLElement).style.backgroundColor).toBe("");
    }
  });
});
