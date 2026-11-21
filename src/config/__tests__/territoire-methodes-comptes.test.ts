import { describe, expect, it } from "vitest";
import { COMPTES_AGREGATS } from "@/config/territoire-comptes";
import { methodeSources, REPERE_METHODES } from "@/config/territoire-methodes";
import { TERRITOIRES_SOURCES } from "@/config/territoires-sources";
import fixture from "./fixtures/ofgl-definitions-agregats.json";

// D28: the five method pages of "Les comptes de la collectivité" ship before any import.
const COMPTES = REPERE_METHODES.filter((m) => m.famille === "COMPTES");

// OFGL aggregate name for each method slug, from the indicator config.
const AGREGAT_BY_SLUG: Record<string, string> = Object.fromEntries(
  COMPTES_AGREGATS.map((a) => [a.methodSlug, a.ofglAgregat])
);

const texts = (m: (typeof COMPTES)[number]) => [
  m.title,
  m.montre,
  m.calcul,
  m.limites,
  m.neDitPas,
  ...m.historique.map((h) => h.text),
];

describe("méthodes des comptes de la collectivité", () => {
  it("couvre les cinq agrégats retenus, ni plus ni moins", () => {
    expect(COMPTES.map((m) => m.slug).sort()).toEqual(Object.keys(AGREGAT_BY_SLUG).sort());
  });

  it("cite mot pour mot la définition publiée par l'OFGL", () => {
    for (const m of COMPTES) {
      const official = fixture.results.find((r) => r.agregat === AGREGAT_BY_SLUG[m.slug]);
      expect(official, m.slug).toBeDefined();
      expect(m.definition?.texte, m.slug).toBe(official!.commentaire);
      expect(m.definition?.lueLe, m.slug).toBe(fixture.readAt);
      expect(m.definition?.documentUrl, m.slug).toMatch(/^https:\/\/data\.ofgl\.fr\//);
    }
  });

  it("renvoie à des sources OFGL du registre, avec licence et attribution", () => {
    for (const m of COMPTES) {
      const sources = methodeSources(m);
      expect(sources).toHaveLength(m.sourceIds.length);
      for (const s of sources) {
        expect(s.producer, s.id).toMatch(/OFGL/);
        expect(s.licence.name, s.id).toMatch(/Licence Ouverte/);
        expect(s.attribution, s.id).toMatch(/Calcul OFGL, source DGFiP/);
      }
    }
  });

  it("garde les sources OFGL en PREVU tant qu'aucun lot n'est importé", () => {
    const ofgl = TERRITOIRES_SOURCES.filter((s) => s.id.startsWith("ofgl-"));
    expect(ofgl).toHaveLength(3);
    for (const s of ofgl) expect(s.status, s.id).toBe("PREVU");
  });

  it("dit l'absence de moyenne de strate et les cas particuliers sur chaque page", () => {
    for (const m of COMPTES) {
      expect(m.limites, m.slug).toMatch(/Aucune moyenne de strate/);
      expect(m.limites, m.slug).toMatch(/Ville de Paris/);
      expect(m.limites, m.slug).toMatch(/Collectivité européenne d'Alsace/);
      expect(m.calcul, m.slug).toMatch(/comptes consolidés/);
    }
  });

  it("n'emploie aucun mot d'appréciation ni de classement", () => {
    for (const m of COMPTES) {
      for (const t of texts(m)) {
        expect(t, m.slug).not.toMatch(
          /élevée?s?\b|faibles?\b|endetté|bonne gestion|mauvaise|lourde?s?\b|excessi|vertueu|dérap|classement|\brang\b|meilleur|\bpire\b/i
        );
      }
    }
  });

  it("ne relie aucun chiffre à un élu ou un parti autrement que pour l'écarter", () => {
    for (const m of COMPTES) {
      const t = [m.montre, m.calcul, m.limites].join(" ");
      expect(t, m.slug).not.toMatch(/\bmaire\b|président|majorité|opposition|\bparti\b/i);
    }
  });

  it("ne contient ni tiret cadratin ni demi-cadratin", () => {
    for (const m of COMPTES) {
      for (const t of [...texts(m), m.definition?.texte ?? ""]) expect(t).not.toMatch(/[—–]/);
    }
  });
});
