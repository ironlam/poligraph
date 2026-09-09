import { describe, it, expect } from "vitest";
import { screenWebResult, type WebResult } from "../web-lead-filter";

const res = (
  title: string,
  description = "",
  publisher: string | null = "Le Monde"
): WebResult => ({
  title,
  url: "https://www.lemonde.fr/article",
  description,
  publisher,
});

describe("screenWebResult", () => {
  // Les cas de bruit ci-dessous sont RÉELS : relevés dans la file des articles
  // à lier, sur l'échantillon des douze candidats les mieux classés.
  describe("bruit mesuré en production", () => {
    it("garde « Affaire Le Pen » quand l'élu EST Le Pen", () => {
      // Une capture d'un seul mot donnait « Le », qui ne contient pas « le pen »,
      // donc l'affaire propre de l'élue était jetée.
      const d = screenWebResult(
        res("Affaire Le Pen : la députée condamnée pour détournement de fonds"),
        { firstName: "Marine", lastName: "Le Pen" }
      );
      expect(d.keep).toBe(true);
    });

    it("écarte l'homonyme d'une affaire criminelle célèbre", () => {
      const d = screenWebResult(
        res("Affaire Xavier Dupont de Ligonnès : que risquent M6 et Julien Courbet"),
        { firstName: "Xavier", lastName: "Dupont" }
      );
      expect(d.keep).toBe(false);
    });

    it("écarte le ministre cité en réaction à l'affaire d'un autre", () => {
      const d = screenWebResult(
        res('Affaire Lyhanna : "Il faut qu\'on incarcère plus", assure Bruno Retailleau'),
        { firstName: "Bruno", lastName: "Retailleau" }
      );
      // Écarté par la porte « aucun terme judiciaire » : « incarcérer » est une
      // opinion de politique pénale, pas une procédure. La porte du tiers est
      // testée séparément, sur un cas qui l'atteint vraiment.
      expect(d.keep).toBe(false);
    });

    it("écarte l'élu cité dans l'affaire d'un tiers, terme judiciaire compris", () => {
      const d = screenWebResult(
        res('Affaire Lyhanna : "un procès nécessaire", estime Bruno Retailleau'),
        { firstName: "Bruno", lastName: "Retailleau" }
      );
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("tiers");
    });

    it("écarte une émission de télévision sans terme judiciaire", () => {
      const d = screenWebResult(res('"Dimanche en politique". Avec Ian Brossat et Maud Bregeon'), {
        firstName: "Maud",
        lastName: "Bregeon",
      });
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("judiciaire");
    });
  });

  describe("vrais signaux", () => {
    it("garde une condamnation nommant l'élu", () => {
      const d = screenWebResult(
        res("Municipales à La Courneuve : condamné pour diffamation, le député Aly Diouara"),
        { firstName: "Aly", lastName: "Diouara" }
      );
      expect(d.keep).toBe(true);
    });

    it("garde une affaire qui porte le nom de l'élu lui-même", () => {
      const d = screenWebResult(
        res("Affaire Afribo : le maire de Rethel jugé pour détournement de fonds"),
        { firstName: "Joseph", lastName: "Afribo" }
      );
      expect(d.keep).toBe(true);
    });

    it("accepte le signal porté par la description seule", () => {
      const d = screenWebResult(
        res("Conseil municipal de Rethel", "Joseph Afribo a été mis en examen mardi."),
        { firstName: "Joseph", lastName: "Afribo" }
      );
      expect(d.keep).toBe(true);
    });
  });

  describe("garde-fous", () => {
    it("écarte tout éditeur hors liste de confiance", () => {
      const d = screenWebResult(res("Afribo condamné", "", null), {
        firstName: "Joseph",
        lastName: "Afribo",
      });
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("confiance");
    });

    it("écarte un éditeur de confiance non admis pour un fait judiciaire", () => {
      // BFMTV est dans TRUSTED_PUBLISHERS mais pas dans les huit éditeurs que
      // la règle 4 admet pour porter une affaire judiciaire. La source
      // découverte devient l'unique source du brouillon.
      const d = screenWebResult(
        {
          title: "Joseph Afribo mis en examen",
          url: "https://www.bfmtv.com/a",
          description: "",
          publisher: "BFMTV",
        },
        { firstName: "Joseph", lastName: "Afribo" }
      );
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("admis");
    });

    it("garde Le Monde, Mediapart et l'AFP", () => {
      for (const url of [
        "https://www.lemonde.fr/a",
        "https://www.mediapart.fr/b",
        "https://www.afp.com/c",
      ]) {
        const d = screenWebResult(
          { title: "Joseph Afribo mis en examen", url, description: "", publisher: "X" },
          { firstName: "Joseph", lastName: "Afribo" }
        );
        expect(d.keep, url).toBe(true);
      }
    });

    it("écarte un résultat qui ne nomme pas l'élu", () => {
      const d = screenWebResult(res("Un maire des Ardennes condamné"), {
        firstName: "Joseph",
        lastName: "Afribo",
      });
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("absent");
    });

    it("écarte les patronymes trop courts pour discriminer", () => {
      const d = screenWebResult(res("Condamnation à Lyon, le tribunal a jugé"), {
        firstName: "Jean",
        lastName: "Le",
      });
      expect(d.keep).toBe(false);
      expect(d.reason).toContain("court");
    });

    it("ignore les accents et la casse", () => {
      const d = screenWebResult(res("MIS EN EXAMEN : Hervé LÉAUTEY devant le tribunal"), {
        firstName: "Hervé",
        lastName: "Léautey",
      });
      expect(d.keep).toBe(true);
    });
  });
});

describe("contenu hébergé plutôt qu'édité", () => {
  const politician = { firstName: "Damien", lastName: "Meslot" };
  const base = {
    title: "Damien Meslot mis en examen pour détournement de fonds publics",
    description: "",
    publisher: "Mediapart",
    pageAge: "2023-01-01T00:00:00",
    age: undefined,
  };

  it("écarte un billet de blog hébergé par un éditeur admis", () => {
    // Mesuré : blogs.mediapart.fr/<pseudo>/liste-non-exhaustive-de-responsables
    const decision = screenWebResult(
      { ...base, url: "https://blogs.mediapart.fr/jean-marc-b/blog/290820/liste" },
      politician
    );
    expect(decision.keep).toBe(false);
  });

  it("écarte une page de tag", () => {
    const decision = screenWebResult(
      { ...base, url: "https://www.lefigaro.fr/tag/detournement-de-fonds-publics" },
      politician
    );
    expect(decision.keep).toBe(false);
  });

  it("garde un article ordinaire du même éditeur", () => {
    const decision = screenWebResult(
      { ...base, url: "https://www.mediapart.fr/journal/france/290820/un-article" },
      politician
    );
    expect(decision.keep).toBe(true);
  });
});
