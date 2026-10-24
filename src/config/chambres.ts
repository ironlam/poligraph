import type { Chamber } from "@/generated/prisma";
import { BRAND_NAVY } from "@/config/brand";

/**
 * Institutional facts about each chamber, shared by the hub doors and the chamber pages.
 * These are constitutional or statutory constants, not measured data: live figures come from
 * `src/lib/data/chambres.ts`.
 */

/** Red of the Sénat accent. Darker than BRAND_RED so white text on it clears 4.5:1. */
export const SENAT_ACCENT = "#b8102a";

export interface ChamberRole {
  title: string;
  text: string;
}

export interface ChamberFact {
  value: string;
  label: string;
}

export interface ChamberProfile {
  chamber: Chamber;
  slug: "assemblee-nationale" | "senat";
  name: string;
  /** Short name with article, for sentences ("à l'Assemblée", "au Sénat"). */
  locative: string;
  tagline: string;
  intro: string;
  accent: string;
  members: string;
  memberLabel: string;
  mandateYears: number;
  roles: ChamberRole[];
  facts: ChamberFact[];
  /** `/politiques?mandate=` value listing the members. */
  mandateFilter: "depute" | "senateur";
}

export const CHAMBER_PROFILES: Record<Chamber, ChamberProfile> = {
  AN: {
    chamber: "AN",
    slug: "assemblee-nationale",
    name: "Assemblée nationale",
    locative: "à l'Assemblée",
    tagline: "Chambre basse",
    intro:
      "Les 577 députés, élus directement par les citoyens, proposent, amendent et votent les lois. En cas de désaccord avec le Sénat, l'Assemblée peut avoir le dernier mot.",
    accent: BRAND_NAVY,
    members: "577",
    memberLabel: "députés",
    mandateYears: 5,
    mandateFilter: "depute",
    roles: [
      {
        title: "Elle vote les lois",
        text: "Chaque texte y est examiné en commission, puis débattu et voté en séance publique.",
      },
      {
        title: "Elle contrôle le Gouvernement",
        text: "Questions au Gouvernement, commissions d'enquête et motion de censure : seule l'Assemblée peut la voter.",
      },
      {
        title: "Elle peut être dissoute",
        text: "Le Président de la République peut dissoudre l'Assemblée et provoquer de nouvelles élections législatives.",
      },
    ],
    facts: [
      { value: "577", label: "députés, un par circonscription" },
      { value: "5 ans", label: "de législature, sauf dissolution" },
      { value: "2 tours", label: "de scrutin pour élire chaque député" },
    ],
  },
  SENAT: {
    chamber: "SENAT",
    slug: "senat",
    name: "Sénat",
    locative: "au Sénat",
    tagline: "Chambre haute",
    intro:
      "Les 348 sénateurs, élus par des élus locaux, représentent les territoires. Ils relisent, modifient et votent les lois. Le Sénat ne peut pas être dissous.",
    accent: SENAT_ACCENT,
    members: "348",
    memberLabel: "sénateurs",
    mandateYears: 6,
    mandateFilter: "senateur",
    roles: [
      {
        title: "Il relit et vote les lois",
        text: "Tout texte doit passer par le Sénat. Il peut le modifier, ce qui relance la navette avec l'Assemblée.",
      },
      {
        title: "Il représente les territoires",
        text: "Les sénateurs sont élus par des élus locaux : conseillers municipaux, départementaux, régionaux et parlementaires.",
      },
      {
        title: "Il contrôle le Gouvernement",
        text: "Questions, commissions d'enquête et missions de contrôle. Il ne peut pas voter de motion de censure.",
      },
    ],
    facts: [
      { value: "348", label: "sénateurs" },
      { value: "6 ans", label: "de mandat" },
      { value: "1 sur 2", label: "renouvelé tous les 3 ans" },
    ],
  },
};

export function chamberPath(chamber: Chamber): string {
  return `/parlement/${CHAMBER_PROFILES[chamber].slug}`;
}

export interface ChamberComparisonRow {
  question: string;
  senat: string;
  an: string;
}

export const CHAMBER_COMPARISON: ChamberComparisonRow[] = [
  {
    question: "Qui élit ?",
    senat: "Des élus locaux (vote indirect)",
    an: "Les citoyens (vote direct)",
  },
  { question: "Combien d'élus ?", senat: "348 sénateurs", an: "577 députés" },
  {
    question: "Durée du mandat",
    senat: "6 ans, renouvellement par moitié",
    an: "5 ans, renouvellement en bloc",
  },
  { question: "Peut être dissous ?", senat: "Non", an: "Oui" },
  {
    question: "Peut renverser le Gouvernement ?",
    senat: "Non",
    an: "Oui, par une motion de censure",
  },
];
