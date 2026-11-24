import { describe, expect, it } from "vitest";
import {
  dossier,
  interco,
  papeete,
  paris,
} from "@/app/territoires/communes/[code]/__tests__/fixtures";
import {
  COMPETENCES_GRAND_PARIS,
  COMPETENCES_MENTION,
  COMPETENCES_SOURCE,
  COMPETENCES_TERRITOIRES,
} from "@/config/territoires-competences";
import { echelleCommune } from "../echelle";

const resume = (d: Parameters<typeof echelleCommune>[0]) =>
  echelleCommune(d).map((b) => [b.titre, b.nom, b.href ?? null, b.competences !== null]);

describe("échelle des territoires d'une commune", () => {
  it("monte de la commune au département puis à la région, chaque niveau lié à sa page", () => {
    const barreaux = echelleCommune(dossier());
    expect(resume(dossier())).toEqual([
      ["Commune", "Rennes", null, true],
      ["Département", "Ille-et-Vilaine (35)", "/territoires/departements/ille-et-vilaine", true],
      ["Région", "Bretagne", "/territoires/regions/bretagne", true],
    ]);
    expect(barreaux.map((b) => b.ici)).toEqual([true, false, false]);
    expect(barreaux[1]?.competences).toBe(COMPETENCES_TERRITOIRES.departement);
  });

  it("insère l'intercommunalité sans lien et sans lui prêter de compétences précises", () => {
    const mgp = { siren: "200054781", name: "Métropole du Grand Paris", nature: "METRO" as const };
    const ept = { siren: "200057867", name: "Plaine Commune", nature: "EPT" as const };
    const barreaux = echelleCommune(
      dossier({
        intercommunalite: interco("DISPONIBLE", [
          { ...mgp, natureLabel: "métropole" },
          { ...ept, natureLabel: "établissement public territorial" },
        ]),
      })
    );
    const intercos = barreaux.filter((b) => b.niveau === "intercommunalite");
    expect(intercos.map((b) => [b.nom, b.href])).toEqual([
      ["Métropole du Grand Paris", undefined],
      ["Plaine Commune", undefined],
    ]);
    // Grand Paris: the métropole and its EPT share the competences, none is named on either.
    expect(intercos.map((b) => b.competences)).toEqual([
      COMPETENCES_GRAND_PARIS,
      COMPETENCES_GRAND_PARIS,
    ]);
    expect(COMPETENCES_GRAND_PARIS).not.toMatch(/déchets|économique/i);
  });

  it("nomme les compétences obligatoires d'une intercommunalité ordinaire, pas l'eau", () => {
    const rennes = {
      siren: "243500139",
      name: "Rennes Métropole",
      nature: "METRO" as const,
      natureLabel: "métropole",
    };
    const [, barreau] = echelleCommune(
      dossier({ intercommunalite: interco("DISPONIBLE", [rennes]) })
    );
    expect(barreau?.competences).toBe(COMPETENCES_TERRITOIRES.intercommunalite);
    expect(COMPETENCES_TERRITOIRES.intercommunalite).toMatch(/déchets.*développement économique/);
    // Water and sanitation are no longer a compulsory transfer everywhere: not asserted.
    expect(COMPETENCES_TERRITOIRES.intercommunalite).not.toMatch(/\beau\b|assainissement/i);
  });

  it("ne nomme pas non plus ces compétences pour la Métropole du Grand Paris seule (Paris)", () => {
    const mgp = {
      siren: "200054781",
      name: "Métropole du Grand Paris",
      nature: "METRO" as const,
      natureLabel: "métropole",
    };
    const barreaux = echelleCommune(dossier({ intercommunalite: interco("DISPONIBLE", [mgp]) }));
    expect(barreaux[1]?.competences).toBe(COMPETENCES_GRAND_PARIS);
  });

  it("ne range pas la Métropole de Lyon parmi les intercommunalités", () => {
    const lyon = {
      siren: "200046977",
      name: "Métropole de Lyon",
      nature: "MET69" as const,
      natureLabel: "collectivité territoriale à statut particulier",
    };
    const barreaux = echelleCommune(dossier({ intercommunalite: interco("DISPONIBLE", [lyon]) }));
    expect(barreaux.some((b) => b.niveau === "intercommunalite")).toBe(false);
  });

  it("ne prête pas les compétences ordinaires à un département de statut particulier", () => {
    const departement = echelleCommune(paris()).find((b) => b.niveau === "departement");
    expect(departement).toMatchObject({
      titre: "Département, statut particulier, voir sa page",
      href: "/territoires/departements/paris",
      competences: null,
    });
  });

  it("s'arrête au territoire pour une collectivité hors région, avec son statut", () => {
    expect(resume(papeete())).toEqual([
      // The communes of an overseas collectivité follow its own statute: no ordinary line.
      ["Commune", "Papeete", null, false],
      [
        "Collectivité d'outre-mer",
        "Polynésie française (987)",
        "/territoires/departements/polynesie-francaise",
        false,
      ],
    ]);
  });

  it("ne présente pas un district sans commune comme une commune", () => {
    const base = papeete();
    const taaf = { code: "984", name: "Terres australes et antarctiques françaises" };
    const [premier] = echelleCommune({
      ...base,
      identity: {
        ...base.identity,
        department: { ...taaf, slug: null },
        territoireHorsRegion: { ...taaf, statut: "Territoire d'outre-mer" },
      },
    });
    expect(premier).toMatchObject({ titre: "Territoire sans commune", competences: null });
  });
});

describe("texte des compétences", () => {
  it("reste court, sans tiret long, avec une source et sa date de vérification", () => {
    for (const ligne of Object.values(COMPETENCES_TERRITOIRES)) {
      expect(ligne.length).toBeLessThanOrEqual(160);
      expect(ligne).not.toMatch(/[–—]/);
      expect(ligne.endsWith(".")).toBe(true);
    }
    expect(COMPETENCES_MENTION).toContain("à titre indicatif et non exhaustif");
    expect(COMPETENCES_SOURCE.url).toMatch(/^https:\/\/www\.collectivites-locales\.gouv\.fr\//);
    expect(COMPETENCES_SOURCE.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("échelle des territoires : lien vers les comptes", () => {
  const liens = (comptes?: Parameters<typeof echelleCommune>[1]) =>
    echelleCommune(dossier(), comptes).map((b) => b.comptesHref ?? null);

  it("ne lie aucune sous-page de comptes tant qu'aucun lot n'est publié", () => {
    expect(liens()).toEqual([null, null, null]);
    expect(liens({ commune: false, echelles: [] })).toEqual([null, null, null]);
  });

  it("lie chaque niveau dont les comptes sont publiés, et seulement ceux-là", () => {
    expect(liens({ commune: true, echelles: ["COM", "DEP", "REG"] })).toEqual([
      "/territoires/communes/rennes-35238/budget",
      "/territoires/departements/ille-et-vilaine/budget",
      "/territoires/regions/bretagne/budget",
    ]);
    expect(liens({ commune: false, echelles: ["REG"] })).toEqual([
      null,
      null,
      "/territoires/regions/bretagne/budget",
    ]);
  });

  it("ne lie pas les comptes d'un territoire hors de toute région", () => {
    const barreaux = echelleCommune(papeete(), { commune: true, echelles: ["COM", "DEP", "REG"] });
    const territoire = barreaux.find((b) => b.niveau === "departement");
    expect(territoire?.comptesHref).toBeUndefined();
  });
});
