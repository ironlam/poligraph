// Navigation configuration
// 3 top-level links + 2 thematic dropdowns + icon tool rail

export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  description?: string;
  /** If set, this item is only shown when the named feature flag is enabled */
  featureFlag?: string;
  /** If true, render with a highlighted/accent style */
  highlight?: boolean;
  /** If true, link opens in a new tab with rel="noopener noreferrer" */
  external?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Primary navigation links (5 direct links, no dropdowns)
// Note: supersedes the old NAV_TOP_LEVEL max-3 rule.
// The new full-screen mobile menu eliminates the overflow constraint.
export const NAV_PRIMARY: NavItem[] = [
  {
    href: "/statistiques",
    label: "Statistiques",
    icon: "barChart",
    description: "Tableaux de bord et analyses",
    featureFlag: "STATISTIQUES_SECTION",
  },
  {
    href: "/politiques",
    label: "Politiques",
    icon: "users",
    description: "Députés, sénateurs, ministres, eurodéputés",
  },
  {
    href: "/affaires",
    label: "Affaires",
    icon: "scale",
    description: "Dossiers judiciaires documentés avec sources",
  },
  {
    href: "/programmes",
    label: "Programmes",
    icon: "bookOpen",
    description: "Programmes des partis par axe thématique",
    featureFlag: "PROGRAMMES_ENABLED",
  },
  {
    href: "/parlement",
    label: "Parlement",
    icon: "landmark",
    description: "Scrutins et positions des élus",
  },
];

// Secondary links shown as pills in mobile menu
export const NAV_SECONDARY: NavItem[] = [
  {
    href: "/comparer",
    label: "Comparer",
    icon: "arrowLeftRight",
    description: "Comparez des représentants",
    featureFlag: "COMPARISON_TOOL",
  },
  {
    href: "/mon-depute",
    label: "Mon député",
    icon: "mapPin",
    description: "Trouvez votre député par code postal",
    featureFlag: "MON_DEPUTE_SECTION",
  },
  {
    href: "/partis",
    label: "Partis",
    icon: "building",
    description: "Les partis et leurs membres",
  },
  {
    href: "/recherche",
    label: "Recherche",
    icon: "search",
    description: "Recherche avancée",
  },
  {
    href: "/parlement/groupes",
    label: "Groupes parlementaires",
    icon: "landmark",
    description: "Groupes de l'AN et du Sénat",
  },
  {
    href: "/procedures-baillons",
    label: "Procédures-bâillons",
    icon: "shieldAlert",
    description: "Catalogue documenté des procédures-bâillons (SLAPP) en France",
  },
  {
    href: "https://boussole.poligraph.fr",
    label: "Boussole",
    icon: "compass",
    description: "Quiz politique pour situer vos positions",
    external: true,
    featureFlag: "BOUSSOLE_ENABLED",
  },
];

export interface ElectionNavItem extends NavItem {
  /** Election.slug, so the renderer can ask the database whether the ballot has been held */
  slug: string;
}

// Elections surfaced ahead of the rest of the navigation, in the mobile menu and in the footer.
//
// Whether an election is over is NOT written here. A boolean in this file would still read
// "À venir" the morning after the vote, until someone deploys. The renderer resolves it from
// Election.round1Date / round2Date through `isElectionOver`, which is the same read-time
// derivation the homepage banner uses. See src/lib/elections/status.ts.
//
// No date is rendered either: the presidential dates carry dateConfirmed = false.
export const NAV_ELECTIONS: ElectionNavItem[] = [
  {
    href: "/elections/senatoriales-2026",
    slug: "senatoriales-2026",
    label: "Sénatoriales 2026",
    icon: "landmark",
    description: "178 sièges renouvelés au suffrage indirect",
  },
  {
    href: "/elections/presidentielle-2027",
    slug: "presidentielle-2027",
    label: "Présidentielle 2027",
    icon: "vote",
    description: "Candidatures, mesures et votes",
  },
  {
    href: "/elections/municipales-2026",
    slug: "municipales-2026",
    label: "Municipales 2026",
    icon: "mapPin",
    description: "Résultats commune par commune",
    featureFlag: "MUNICIPALES_2026",
  },
];

/** @deprecated Use NAV_PRIMARY instead */
export const NAV_TOP_LEVEL = NAV_PRIMARY;

/** @deprecated Dropdown groups removed in redesign */
export const NAV_GROUPS: NavGroup[] = [];

// Icon-only tool buttons in the header utility rail
export const NAV_TOOLS: NavItem[] = [
  {
    href: "/comparer",
    label: "Comparer",
    icon: "arrowLeftRight",
    description: "Comparez des représentants, partis ou groupes",
    featureFlag: "COMPARISON_TOOL",
  },
  {
    href: "/mon-observatoire",
    label: "Mon Observatoire",
    icon: "telescope",
    description: "Suivez l'activité de vos représentants",
  },
];

export const CTA_ASSISTANT: NavItem = {
  href: "/chat",
  label: "Assistant IA",
  description: "Chatbot alimenté par nos données",
};

// Legacy exports for backwards compatibility
export const CTA_COMPARER: NavItem = {
  href: "/comparer",
  label: "Comparer",
  description: "Comparez des représentants, partis ou groupes parlementaires",
  featureFlag: "COMPARISON_TOOL",
};
export const CTA_MON_DEPUTE: NavItem = {
  href: "/mon-depute",
  label: "Mon député",
  description: "Trouvez votre député par code postal",
  featureFlag: "MON_DEPUTE_SECTION",
};
export const CHAT_LINK = CTA_ASSISTANT;
export const CTA_LINK = CTA_MON_DEPUTE;

// Footer navigation (5 columns)
export interface FooterSection {
  title: string;
  /** If true, the section heading is rendered in the accent colour */
  highlight?: boolean;
  links: Array<{
    href: string;
    label: string;
    featureFlag?: string;
    external?: boolean;
  }>;
}

export const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Élections",
    highlight: true,
    links: [
      ...NAV_ELECTIONS.map(({ href, label, featureFlag }) => ({ href, label, featureFlag })),
      { href: "/elections", label: "Toutes les élections" },
    ],
  },
  {
    title: "Représentants",
    links: [
      { href: "/politiques", label: "Tous les représentants" },
      { href: "/partis", label: "Partis politiques" },
      { href: "/affaires", label: "Affaires judiciaires" },
      { href: "/mon-depute", label: "Mon député", featureFlag: "MON_DEPUTE_SECTION" },
      { href: "/comparer", label: "Comparer", featureFlag: "COMPARISON_TOOL" },
      { href: "/factchecks", label: "Fact-checks" },
    ],
  },
  {
    title: "Parlement",
    links: [
      { href: "/parlement", label: "Travail parlementaire" },
      {
        href: "/parlement/dossiers",
        label: "Dossiers législatifs",
        featureFlag: "ASSEMBLEE_SECTION",
      },
      { href: "/declarations-et-patrimoine", label: "Patrimoine & déclarations" },
      { href: "/statistiques", label: "Statistiques", featureFlag: "STATISTIQUES_SECTION" },
    ],
  },
  {
    title: "Explorer",
    links: [
      { href: "/recap", label: "Le Recap" },
      { href: "/procedures-baillons", label: "Procédures-bâillons" },
      { href: "/programmes", label: "Programmes", featureFlag: "PROGRAMMES_ENABLED" },
      { href: "/presse", label: "Revue de presse", featureFlag: "PRESS_SECTION" },
      { href: "/departements", label: "Départements" },
      { href: "/recherche", label: "Recherche" },
      { href: "/mon-observatoire", label: "Mon Observatoire" },
    ],
  },
  {
    title: "Le projet",
    links: [
      { href: "/chat", label: "Assistant IA" },
      { href: "/sources", label: "Sources et principes" },
      { href: "/methodologie", label: "Méthodologie" },
      { href: "/docs/api", label: "API" },
      {
        href: "https://boussole.poligraph.fr",
        label: "Boussole",
        external: true,
        featureFlag: "BOUSSOLE_ENABLED",
      },
      { href: "/soutenir", label: "Nous soutenir" },
      { href: "/mentions-legales", label: "Mentions légales" },
    ],
  },
];

// External data sources for footer
export const DATA_SOURCES = [
  { href: "https://data.assemblee-nationale.fr", label: "Assemblée nationale" },
  { href: "https://www.senat.fr/open-data", label: "Sénat" },
  { href: "https://www.hatvp.fr", label: "HATVP" },
  { href: "https://www.wikidata.org", label: "Wikidata" },
  { href: "https://www.europarl.europa.eu", label: "Parlement européen" },
  { href: "https://toolbox.google.com/factcheck/explorer", label: "Google Fact Check" },
  { href: "https://datan.fr", label: "Datan" },
] as const;

// RSS feeds for footer
export const RSS_FEEDS = [
  { href: "/api/rss/affaires.xml", label: "Affaires" },
  { href: "/api/rss/votes.xml", label: "Votes" },
  { href: "/api/rss/factchecks.xml", label: "Fact-checks" },
] as const;

// Social media links for footer
export interface SocialLink {
  href: string;
  label: string;
  /** Lucide icon name, or "x" for custom SVG */
  icon: "x" | "bluesky" | "instagram" | "github";
}

export const SOCIAL_LINKS: SocialLink[] = [
  { href: "https://x.com/poligraph_fr", label: "X (Twitter)", icon: "x" },
  {
    href: "https://bsky.app/profile/poligraph-fr.bsky.social",
    label: "Bluesky",
    icon: "bluesky",
  },
  {
    href: "https://www.instagram.com/poligraph_fr",
    label: "Instagram",
    icon: "instagram",
  },
  {
    href: "https://github.com/ironlam/poligraph",
    label: "GitHub",
    icon: "github",
  },
];

// Legacy exports for backwards compatibility
export const NAV_LINKS = [
  { href: "/politiques", label: "Représentants" },
  { href: "/parlement", label: "Parlement" },
  { href: "/affaires", label: "Affaires" },
  { href: "/partis", label: "Partis" },
  { href: "/statistiques", label: "Stats" },
] as const;

export const FOOTER_LINKS = [
  { href: "/recherche", label: "Recherche avancée" },
  { href: "/departements", label: "Départements" },
  { href: "/institutions", label: "Institutions" },
  { href: "/sources", label: "Sources" },
  { href: "/methodologie", label: "Méthodologie" },
  { href: "/docs/api", label: "API" },
  { href: "/mentions-legales", label: "Mentions légales" },
] as const;

export type NavLink = (typeof NAV_LINKS)[number];
export type FooterLink = (typeof FOOTER_LINKS)[number];
