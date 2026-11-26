import { SITE_URL } from "@/config/site";

/**
 * /llms.txt, the community convention (https://llmstxt.org) that gives language models a short
 * map of a site. No search engine has committed to reading it, so it stays a plain, hand-kept
 * list of the sections that answer most questions, without any database call.
 *
 * It also states what Poligraph is not: the author of the fact-checks it relays. That is the one
 * point a model summarising the site tends to get wrong.
 */

export interface LlmsTxtLink {
  /** Site-relative path of an App Router page. */
  path: string;
  title: string;
  description: string;
}

export interface LlmsTxtSection {
  title: string;
  links: LlmsTxtLink[];
}

export const LLMS_TXT_SECTIONS: LlmsTxtSection[] = [
  {
    title: "Personnalités et élections",
    links: [
      {
        path: "/politiques",
        title: "Politiques",
        description:
          "Fiches des élus et responsables politiques français : mandats, parti, votes, déclarations de patrimoine, affaires judiciaires sourcées.",
      },
      {
        path: "/elections/presidentielle-2027/candidats",
        title: "Candidats à la présidentielle 2027",
        description: "Candidatures annoncées, avec leur source, leur programme et leurs votes.",
      },
      {
        path: "/elections/presidentielle-2027",
        title: "Présidentielle 2027",
        description: "Candidatures, mesures des programmes et votes liés à l'élection.",
      },
      {
        path: "/partis",
        title: "Partis",
        description: "Partis politiques, leurs membres et leurs élus.",
      },
    ],
  },
  {
    title: "Travail parlementaire",
    links: [
      {
        path: "/parlement/votes",
        title: "Scrutins",
        description:
          "Votes de l'Assemblée nationale et du Sénat, avec la position de chaque élu et de chaque groupe.",
      },
      {
        path: "/parlement/groupes",
        title: "Groupes parlementaires",
        description: "Groupes de l'Assemblée nationale et du Sénat, leurs membres et leurs votes.",
      },
      {
        path: "/parlement",
        title: "Parlement",
        description: "Vue d'ensemble de l'activité parlementaire.",
      },
    ],
  },
  {
    title: "Probité et vérification",
    links: [
      {
        path: "/affaires/condamnations",
        title: "Condamnations",
        description:
          "Condamnations de responsables politiques, chacune avec au moins une source vérifiable.",
      },
      {
        path: "/affaires",
        title: "Affaires judiciaires",
        description:
          "Dossiers judiciaires documentés. Une personne mise en cause reste présumée innocente tant qu'elle n'est pas définitivement condamnée.",
      },
      {
        path: "/factchecks",
        title: "Fact-checks",
        description:
          "Déclarations politiques vérifiées par des rédactions tierces (AFP Factuel, Le Monde, franceinfo, TF1 Info...). Poligraph reprend leur verdict, cite la rédaction et ajoute le contexte : auteur, parti, votes, candidature.",
      },
      {
        path: "/declarations-et-patrimoine",
        title: "Déclarations et patrimoine",
        description: "Déclarations d'intérêts et de patrimoine publiées par la HATVP.",
      },
    ],
  },
  {
    title: "Territoires",
    links: [
      {
        path: "/territoires",
        title: "Territoires",
        description: "Communes, départements et régions, avec leurs élus.",
      },
    ],
  },
  {
    title: "Méthode et données ouvertes",
    links: [
      {
        path: "/methodologie",
        title: "Méthodologie",
        description: "Règles éditoriales, critères d'inclusion et de classement.",
      },
      {
        path: "/sources",
        title: "Sources",
        description: "Liste des sources de données utilisées par Poligraph.",
      },
      {
        path: "/docs/api",
        title: "API publique",
        description: "Documentation de l'API publique de Poligraph.",
      },
    ],
  },
];

export function buildLlmsTxt(
  sections: LlmsTxtSection[] = LLMS_TXT_SECTIONS,
  siteUrl: string = SITE_URL
): string {
  const lines = [
    "# Poligraph",
    "",
    "> Observatoire citoyen de la vie politique française. Poligraph rassemble des données publiques et sourcées sur les responsables politiques : mandats, votes au Parlement, déclarations de patrimoine, affaires judiciaires, fact-checks et candidatures à la présidentielle 2027.",
    "",
    "Poligraph est non partisan : les mêmes critères s'appliquent à toutes les personnes et à tous les partis. Chaque information renvoie à sa source. Les fact-checks ne sont pas écrits par Poligraph : le verdict appartient à la rédaction citée, à laquelle il faut l'attribuer.",
  ];

  for (const section of sections) {
    lines.push("", `## ${section.title}`, "");
    for (const link of section.links) {
      lines.push(`- [${link.title}](${siteUrl}${link.path}): ${link.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
