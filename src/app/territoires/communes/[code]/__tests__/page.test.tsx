import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommuneDossier } from "@/lib/data/territoires";
import { getCollectivitesForCommune } from "@/config/collectivites-particulieres";
import { DEPARTMENT_OUTLINES } from "@/config/territoires-shapes";
import { dossier, grandeCommune, interco, papeete, paris, reunion, withMaire } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getCommuneDossier: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/data/territoires", () => ({
  getCommuneDossier: (code: string) => mocks.getCommuneDossier(code),
}));
// The history reader hits the database: the page then falls back on the dossier's own scrutins.
vi.mock("@/lib/data/territoire-elections", () => ({
  getCommuneElections: () => Promise.resolve(null),
}));

import Page, { generateMetadata, generateStaticParams } from "../page";

async function render(data: CommuneDossier | null, code = data?.identity.inseeCode ?? "35238") {
  mocks.getCommuneDossier.mockResolvedValue(data);
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ code }) }));
  const document = new DOMParser().parseFromString(html, "text/html");
  const text = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { html, document, text };
}

const metadataFor = async (data: CommuneDossier | null, code = "35238") => {
  mocks.getCommuneDossier.mockResolvedValue(data);
  return generateMetadata({ params: Promise.resolve({ code }) });
};

beforeEach(() => vi.clearAllMocks());

describe("/territoires/communes/[code]", () => {
  it("ne génère aucune commune au build", () => {
    expect(generateStaticParams()).toEqual([]);
  });

  it("ne lie aucune page de décisions tant qu'aucune n'est publiée", async () => {
    const { document, text } = await render(dossier());
    expect(document.querySelector('a[href="/territoires/communes/35238/decisions"]')).toBeNull();
    expect(text).not.toContain("Décisions");
  });

  it("lie la page des décisions dès qu'une décision est publiée", async () => {
    const { document } = await render({ ...dossier(), decisionsPubliees: 2 });
    expect(
      document.querySelector('a[href="/territoires/communes/35238/decisions"]')?.textContent
    ).toBe("Décisions");
  });

  it("affiche la superficie en km² avec sa source, et rien quand elle est inconnue", async () => {
    const base = dossier();
    const sans = await render(base);
    expect(sans.text).not.toContain("Superficie");

    const avec = await render({
      ...base,
      surface: { hectares: 5033.19, source: base.surface.source },
    });
    expect(avec.text).toContain("Superficie");
    expect(avec.text).toContain("50,3 km²");
    expect(avec.text).toContain("geo.api.gouv.fr, surface de la commune");
    expect(avec.text).not.toContain("IGN");
  });

  it("répond 404 pour un code sans commune", async () => {
    await expect(render(null, "99999")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("présente le maire établi avec sa date et sa source, sans confirmation inventée", async () => {
    const { document, text } = await render(dossier());

    expect(document.querySelector("h1")?.textContent).toBe("Rennes");
    expect(document.querySelector('a[href="/politiques/camille-exemple"]')).not.toBeNull();
    expect(text).toContain("En fonction depuis le 22 mars 2026.");
    expect(text).toContain("Source : Répertoire National des Élus");
    expect(text).not.toContain("dernière confirmation");
    expect(text).toContain("Composition actuelle non établie");
  });

  it("donne la date de dernière confirmation quand elle existe", async () => {
    const base = dossier();
    const { text } = await render({
      ...base,
      maire: { ...base.maire, lastConfirmedAt: "2026-10-01T00:00:00.000Z" },
    });
    expect(text).toContain("dernière confirmation le 1 octobre 2026");
  });

  it("ne nomme personne quand le maire n'est pas établi", async () => {
    const { document, text } = await render(withMaire("NON_ETABLI"));

    expect(text).toContain("Titulaire non établi");
    expect(text).toContain("Le maire en fonction n'est pas établi dans Poligraph.");
    // The head of list may still be named in the results, never as mayor.
    expect(document.querySelector("#qui-decide a[href^='/politiques/']")).toBeNull();
  });

  it("dit l'absence de maire en mots, sans zéro ni tiret", async () => {
    const { text } = await render(withMaire("ABSENT"));

    expect(text).toContain("Non renseigné");
    expect(text).toContain("Aucun maire en fonction n'est enregistré pour Rennes dans Poligraph.");
    expect(text).not.toMatch(/[—–]/);
  });

  it("garde la réserve d'adresse sur le député et renvoie vers Mon député", async () => {
    const { document, text } = await render(dossier());

    expect(text).toContain("1re circonscription");
    expect(text).toContain("Selon votre adresse, une autre circonscription peut s'appliquer");
    expect(document.querySelector('a[href="/mon-depute"]')).not.toBeNull();
    expect(
      document.querySelector('#parlement a[href="/territoires/departements/ille-et-vilaine"]')
        ?.textContent
    ).toBe("Ille-et-Vilaine (35) : sénateurs et députés");
    expect(text).not.toMatch(/partie (nord|sud)/);
  });

  it("accorde la fonction à la civilité enregistrée", async () => {
    const { document, text } = await render(dossier());
    expect(text).toContain("Députée : Dominique Député");
    expect(document.querySelector("#parlement")?.textContent).toContain(
      "députée de cette circonscription"
    );
  });

  it("n'accorde rien au hasard quand la civilité est inconnue", async () => {
    const base = dossier();
    const depute = { ...base.parlement.deputes.deputes[0]!, civility: null };
    const { text } = await render({
      ...base,
      parlement: { ...base.parlement, deputes: { ...base.parlement.deputes, deputes: [depute] } },
    });
    expect(text).toContain("À l'Assemblée nationale : Dominique Député");
    expect(text).not.toMatch(/Dominique Député · député|député·e|député\(e\)/);
  });

  it("nomme le député de la circonscription enregistrée avec la réserve, jamais comme certain", async () => {
    const { document } = await render(grandeCommune());
    const header = document.querySelector("header")?.textContent ?? "";
    const section = document.querySelector("#parlement")?.textContent ?? "";

    expect(header).toContain("1re circonscription enregistrée");
    expect(header).toContain("Selon l'adresse, vérifiez avec Mon député");
    expect(header).not.toContain("Dominique Député");
    expect(section).toContain(
      "Rien n'établit que la commune relève de cette seule circonscription"
    );
    expect(section).toContain("Dominique Député");
    expect(document.querySelector('#parlement a[href="/mon-depute"]')).not.toBeNull();
  });

  it("ne désigne aucun député dans une commune à plusieurs circonscriptions", async () => {
    const { document, text } = await render(paris());

    expect(text).toContain("Plusieurs circonscriptions législatives couvrent Paris");
    expect(document.querySelector("#parlement a[href^='/politiques/']")).toBeNull();
  });

  it("affiche la note de collectivité particulière et les maires de secteur repliés", async () => {
    const { document, text } = await render(paris());

    expect(text).toContain("Ville de Paris");
    expect(text).toContain("Loi n° 2017-257 du 28 février 2017 relative au statut de Paris");
    const details = document.querySelector("#qui-decide details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.textContent).toContain("Alex Secteur");
  });

  it("présente les résultats dans la teinte de marque, sans couleur ni étiquette de parti", async () => {
    const { document, text } = await render(dossier());

    expect(text).toContain("Municipales 2026");
    expect(text).toContain("1er tour (15 mars 2026), participation 63,3 %");
    expect(text).toContain("54,2 %");
    expect(text).toContain("élue au 1er tour");
    const bars = [...document.querySelectorAll("#elections li [style]")];
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      // One brand hue for every list: never a party colour. The elected list is the solid one.
      expect(bar.className).toMatch(/bg-primary/);
      expect(bar.className).not.toMatch(/bg-(red|blue|green|orange|yellow|pink|purple)/);
      expect(bar.getAttribute("style")).toMatch(/^width:\s*[\d.]+%;?$/);
    }
    expect(
      document.querySelector('a[href="/elections/municipales-2026/communes/35238"]')
    ).not.toBeNull();
    expect(text).toContain("Présidentielle 2027 : les résultats de la commune apparaîtront ici");
  });

  it("ne déclare pas élue au 1er tour une liste majoritaire sans le quart des inscrits établi", async () => {
    const base = dossier();
    const block = base.elections.municipales2026!;
    const { text } = await render({
      ...base,
      elections: {
        ...base.elections,
        municipales2026: {
          ...block,
          listes: block.listes.map((l) => ({
            ...l,
            electionAuPremierTour: "NON_ETABLI" as const,
          })),
        },
      },
    });
    expect(text).toContain("54,2 %");
    expect(text).not.toContain("élue au 1er tour");
  });

  it("dit qu'aucun résultat n'est enregistré", async () => {
    const { text } = await render(papeete());
    expect(text).toContain("Aucun résultat des municipales 2026 n'est enregistré");
  });

  it("navigue par ancres, sans onglet Décisions ni badge de dossier", async () => {
    const { document, text } = await render(dossier());

    const anchors = [...document.querySelectorAll('nav[aria-label="Sections de la page"] a')];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "#qui-decide",
      "#elections",
      "#sources",
      "/territoires/communes/35238/elections",
    ]);
    for (const id of ["qui-decide", "elections", "sources"]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
    expect(anchors[0]?.textContent).toBe("Élus et institutions");
    expect(document.getElementById("qui-decide-titre")?.textContent).toBe("Élus et institutions");
    expect(text).not.toContain("Qui décide");
    expect(text).not.toMatch(/Décisions|Socle officiel|Dossier curé|intercommunalit|superficie/i);
    expect(text).toContain(
      "Informations disponibles : maire, population, circonscription législative, sénateurs du département, résultats des municipales 2026."
    );
  });

  it("propose la réutilisation et le signalement existants", async () => {
    const { document } = await render(dossier());

    expect(document.querySelectorAll('a[href="/api/v1/territoires/communes/35238"]').length).toBe(
      2
    );
    expect(document.querySelector('a[href="/support"]')?.textContent).toBe("Signaler une erreur");
    expect(document.querySelector('a[href="/methodologie"]')).not.toBeNull();
    expect(document.querySelector('a[href*="csv"]')).toBeNull();
  });

  it("dessine la silhouette du département avec le repère de la commune, en décor", async () => {
    const { document } = await render(dossier());

    const svgs = [...document.querySelectorAll("header svg:not(.lucide)")];
    expect(svgs.length).toBeGreaterThan(0);
    expect(svgs.every((svg) => svg.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(document.querySelector("[data-territory-marker]")).not.toBeNull();
  });

  it.each([
    ["La Réunion", reunion, "974"],
    ["Polynésie française", papeete, "987"],
  ] as const)(
    "dessine en %s le contour du territoire et le repère de la commune",
    async (_, make, code) => {
      const { document } = await render(make());

      const svgs = [...document.querySelectorAll("header svg:not(.lucide)")];
      // Its own territory, never metropolitan France: no mini inset overseas.
      expect(svgs).toHaveLength(1);
      expect(svgs[0]!.getAttribute("aria-hidden")).toBe("true");
      expect(svgs[0]!.getAttribute("viewBox")).toBe(DEPARTMENT_OUTLINES[code]!.viewBox);
      expect(svgs[0]!.querySelector("path")!.getAttribute("d")).toBe(DEPARTMENT_OUTLINES[code]!.d);
      expect(document.querySelector("[data-territory-marker]")).not.toBeNull();
    }
  );

  it("relie la commune d'un DROM à sa région", async () => {
    const { document, text } = await render(reunion());

    expect(text).toContain("Commune · La Réunion (974)");
    expect(document.querySelector('a[href="/territoires/regions/la-reunion"]')).not.toBeNull();
  });

  it("présente une COM hors région, avec son statut et sans région", async () => {
    const { document, text } = await render(papeete());
    const crumbs = [...document.querySelectorAll('nav[aria-label="Fil d\'Ariane"] li')].map(
      (li) => li.textContent
    );

    expect(crumbs).toEqual(["Territoires", "Outre-mer", "Polynésie française (987)", "Papeete"]);
    expect(text).toContain("Collectivité d'outre-mer hors région");
    expect(text).toContain("Circonscription non renseignée");
    expect(document.querySelector('a[href^="/territoires/regions/"]')).toBeNull();
  });

  it("date la population par son millésime et sa date d'entrée en vigueur, avec la source", async () => {
    const base = dossier();
    const { document, text } = await render({
      ...base,
      population: {
        value: 230890,
        vintage: {
          millesime: 2023,
          effectiveFrom: "2026-01-01",
          producer: "INSEE",
          sourceLabel: "INSEE, populations de référence 2023 (décret n° 2025-1362)",
          sourceUrl: "https://www.insee.fr/fr/statistiques/8680726",
          importedAt: "2026-10-11T08:00:00.000Z",
        },
        importedAt: "2026-10-11T08:00:00.000Z",
        source: {
          label: "INSEE, populations de référence 2023 (décret n° 2025-1362)",
          url: "https://www.insee.fr/fr/statistiques/8680726",
        },
      },
    });

    const hero = document.querySelector("header")?.textContent ?? "";
    expect(hero).toContain("Population municipale 2023, en vigueur au 1er janvier 2026 (INSEE)");
    expect(hero).not.toContain("geo.api.gouv.fr");
    expect(
      document.querySelector('header a[href="https://www.insee.fr/fr/statistiques/8680726"]')
    ).not.toBeNull();
    expect(document.querySelector("#sources")?.textContent).toContain(
      "vérifiée le 11 octobre 2026"
    );
    expect(text).not.toContain("importée le");
  });

  it("porte la source propre d'une collectivité à recensement distinct", async () => {
    const base = papeete();
    const { document } = await render({
      ...base,
      population: {
        value: 26654,
        vintage: {
          millesime: 2022,
          effectiveFrom: "2023-01-01",
          producer: "ISPF",
          sourceLabel: "ISPF et INSEE, recensement de la Polynésie française 2022",
          sourceUrl: "https://www.insee.fr/fr/statistiques/6689891",
          importedAt: "2026-10-11T08:00:00.000Z",
        },
        importedAt: "2026-10-11T08:00:00.000Z",
        source: {
          label: "ISPF et INSEE, recensement de la Polynésie française 2022",
          url: "https://www.insee.fr/fr/statistiques/6689891",
        },
      },
    });

    expect(document.querySelector("header")?.textContent).toContain(
      "Population municipale 2022, en vigueur au 1er janvier 2023 (ISPF)"
    );
  });

  it("sans série millésimée, n'invente aucun millésime", async () => {
    const { document, text } = await render(dossier());

    expect(document.querySelector("header")?.textContent).toContain(
      "Source INSEE via geo.api.gouv.fr"
    );
    expect(text).not.toMatch(/en vigueur au/);
    expect(text).toContain("importée le");
  });

  it("ne présente pas un district des TAAF comme une commune", async () => {
    const base = papeete();
    const { text } = await render({
      ...base,
      identity: {
        ...base.identity,
        inseeCode: "98411",
        name: "Îles Saint-Paul et Nouvelle-Amsterdam",
        department: {
          code: "984",
          name: "Terres australes et antarctiques françaises",
          slug: null,
        },
        territoireHorsRegion: {
          code: "984",
          name: "Terres australes et antarctiques françaises",
          statut: "Territoire d'outre-mer à statut particulier (loi du 6 août 1955)",
        },
      },
    });

    expect(text).toContain("District · ");
    expect(text).toContain("Pas de conseil municipal");
    expect(text).not.toContain("Composition actuelle non établie");
    expect(text).not.toContain("Présidentielle 2027");
  });

  it("met la réponse principale (le maire) avant les repères secondaires", async () => {
    const { document } = await render(withMaire("NON_ETABLI"));
    const facts = [...document.querySelectorAll("header dt")].map((dt) => dt.textContent);
    expect(facts).toEqual(["Maire", "Population", "Au Parlement"]);
  });

  it("publie un JSON-LD AdministrativeArea limité aux faits affichés", async () => {
    const { document } = await render(dossier());
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>
    );
    const area = blocks.find((b) => b["@type"] === "AdministrativeArea");

    expect(area).toMatchObject({
      name: "Rennes",
      url: "https://poligraph.fr/territoires/communes/35238",
      identifier: { "@type": "PropertyValue", propertyID: "Code INSEE", value: "35238" },
      containedInPlace: { name: "Ille-et-Vilaine" },
    });
    expect(JSON.stringify(area)).not.toMatch(/geo|population|latitude/i);
  });
});

describe("metadata /territoires/communes/[code]", () => {
  it("donne un titre nominatif, une description factuelle et une canonique", async () => {
    const m = await metadataFor(dossier());

    expect(m.title).toBe("Rennes (35) : maire, élus et résultats");
    expect(m.description).toContain("Maire : Camille Exemple.");
    expect(m.alternates?.canonical).toBe("/territoires/communes/35238");
    expect(m.robots).toBeUndefined();
  });

  it("ne promet pas de maire non établi dans le titre et ne l'indexe pas", async () => {
    const m = await metadataFor(withMaire("NON_ETABLI"));

    expect(m.title).toBe("Rennes (35) : élus et résultats");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("n'indexe pas une petite commune", async () => {
    const base = dossier();
    const m = await metadataFor({ ...base, population: { ...base.population, value: 150 } });
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("noindex une commune introuvable", async () => {
    const m = await metadataFor(null, "99999");
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});

describe("intercommunalité", () => {
  const MGP = {
    siren: "200054781",
    name: "Métropole du Grand Paris",
    nature: "METRO" as const,
    natureLabel: "métropole",
  };
  const PLAINE = {
    siren: "200057867",
    name: "Plaine Commune",
    nature: "EPT" as const,
    natureLabel: "établissement public territorial",
  };

  /** Text of the intercommunality card, located by its label. */
  function card(document: Document, label: string): Element | null {
    const p = [...document.querySelectorAll("#qui-decide p")].find(
      (el) => el.textContent === label
    );
    return p?.parentElement ?? null;
  }

  it("nomme la MGP et l'EPT, nature en toutes lettres, situation et source, sans lien ni compétence", async () => {
    const { document } = await render(
      dossier({ intercommunalite: interco("DISPONIBLE", [MGP, PLAINE]) })
    );
    const el = card(document, "Intercommunalité");
    const text = el?.textContent?.replace(/\s+/g, " ") ?? "";

    expect(text).toContain("Métropole du Grand Paris");
    expect(text).toContain("Métropole, situation au 1er janvier 2026");
    expect(text).toContain("Plaine Commune");
    expect(text).toContain("Établissement public territorial, situation au 1er janvier 2026");
    expect(text).toContain("INSEE, EPCI à fiscalité propre au 1er janvier 2026");
    expect(text).toContain("INSEE, établissements publics territoriaux au 1er janvier 2026");
    expect(text).toContain("dernière vérification le 12 octobre 2026");
    expect(text).not.toMatch(/compétence/i);
    // Only the external source links: Poligraph has no intercommunality page to link to.
    const hrefs = [...(el?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBe(2);
    expect(new Set(hrefs)).toEqual(new Set(["https://www.insee.fr/fr/information/2510634"]));
  });

  it("garde le maire avant l'intercommunalité dans l'ordre de lecture", async () => {
    const { html } = await render(dossier({ intercommunalite: interco("DISPONIBLE", [MGP]) }));
    expect(html.indexOf("Camille Exemple")).toBeGreaterThan(-1);
    expect(html.indexOf("Camille Exemple")).toBeLessThan(html.indexOf("Métropole du Grand Paris"));
  });

  it("ne présente pas la Métropole de Lyon comme une intercommunalité", async () => {
    const lyon = {
      siren: "200046977",
      name: "Métropole de Lyon",
      nature: "MET69" as const,
      natureLabel: "collectivité territoriale à statut particulier",
    };
    const { document, text } = await render(
      dossier({ intercommunalite: interco("DISPONIBLE", [lyon]) })
    );
    expect(card(document, "Intercommunalité")).toBeNull();
    expect(text).toContain(
      "Rennes est sur le territoire de la Métropole de Lyon, une collectivité territoriale à statut particulier et non une intercommunalité. Situation au 1er janvier 2026."
    );
  });

  it("ne répète pas la Métropole de Lyon déjà présentée par la note de statut de Lyon", async () => {
    const lyon = {
      siren: "200046977",
      name: "Métropole de Lyon",
      nature: "MET69" as const,
      natureLabel: "collectivité territoriale à statut particulier",
    };
    const base = dossier({ intercommunalite: interco("DISPONIBLE", [lyon]) });
    const { text } = await render({
      ...base,
      identity: {
        ...base.identity,
        inseeCode: "69123",
        name: "Lyon",
        collectivitesParticulieres: getCollectivitesForCommune("69123"),
      },
    });
    expect(text).toContain("Lyon fait partie de la Métropole de Lyon");
    expect(text).not.toContain("non une intercommunalité");
  });

  it("dit l'absence établie par la source pour une île mono-communale", async () => {
    const { text } = await render(dossier({ intercommunalite: interco("AUCUNE") }));
    expect(text).toContain("Aucune intercommunalité à fiscalité propre");
    expect(text).toContain(
      "Selon l'INSEE, Rennes n'appartient à aucune intercommunalité à fiscalité propre. Situation au 1er janvier 2026."
    );
  });

  it("dit « non établie » pour une collectivité d'outre-mer, jamais « aucune »", async () => {
    const { text } = await render({ ...papeete(), intercommunalite: interco("NON_ETABLI") });
    expect(text).toContain("Non établie");
    expect(text).toContain(
      "Ce territoire (Polynésie française) ne figure pas dans les fichiers nationaux de l'INSEE : l'intercommunalité de Papeete n'est pas établie dans Poligraph."
    );
    expect(text).not.toContain("Aucune intercommunalité");
  });
});

describe("absence de composant client cartographique", () => {
  const ROOT = process.cwd();
  it.each([
    "src/app/territoires/communes/[code]/page.tsx",
    "src/components/territoires/CommuneHero.tsx",
    "src/components/territoires/CommuneSections.tsx",
    "src/components/territoires/IntercommunaliteCard.tsx",
    "src/components/territoires/TerritoryShape.tsx",
  ])("%s reste un composant serveur sans bibliothèque de carte", (path) => {
    const source = readFileSync(join(ROOT, path), "utf8");
    expect(source).not.toMatch(/^["']use client["']/m);
    expect(source).not.toMatch(/leaflet|maplibre|mapbox|react-simple-maps|d3-geo/);
  });
});
