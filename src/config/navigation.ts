// Navigation configuration: primary sections, election block, icon tool rail

import {
  TERRITOIRES_PATH,
  TERRITOIRES_REGIONS_ANCHOR,
  TERRITOIRES_DEPARTEMENTS_PATH,
} from "@/lib/territoires/paths";

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
  /** Sub-links, rendered by the mobile menu only (the desktop header ignores them) */
  children?: NavItem[];
  /**
   * Rendered by the mobile menu only. On desktop the item lives in the panel of the election put
   * forward (see `getElectionSpotlight`), and in the footer.
   */
  mobileOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Primary navigation. Desktop shows the six sections without `mobileOnly`; the mobile menu shows
// every item, with the `children` as sub-links.
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
    children: [
      { href: "/politiques", label: "Personnes", featureFlag: "gouvernements" },
      {
        href: "/politiques/gouvernements",
        label: "Gouvernements",
        featureFlag: "gouvernements",
      },
      {
        href: "/politiques/gouvernements/membres",
        label: "Membres des gouvernements",
        featureFlag: "gouvernements",
      },
    ],
  },
  {
    href: TERRITOIRES_PATH,
    label: "Territoires",
    icon: "mapPin",
    description: "Communes, départements, régions et leurs élus",
    children: [
      { href: TERRITOIRES_PATH, label: "Ma commune" },
      { href: TERRITOIRES_DEPARTEMENTS_PATH, label: "Départements" },
      { href: TERRITOIRES_REGIONS_ANCHOR, label: "Régions" },
      { href: "/mon-depute", label: "Mon député", featureFlag: "MON_DEPUTE_SECTION" },
    ],
  },
  {
    href: "/affaires",
    label: "Affaires",
    icon: "scale",
    description: "Dossiers judiciaires documentés avec sources",
  },
  {
    href: "/factchecks",
    label: "Fact-checks",
    icon: "searchCheck",
    description: "Déclarations vérifiées par les fact-checkeurs",
  },
  {
    href: "/parlement",
    label: "Parlement",
    icon: "landmark",
    description: "Scrutins et positions des élus",
  },
  {
    href: "/programmes",
    label: "Programmes",
    icon: "bookOpen",
    description: "Programmes des partis par axe thématique",
    featureFlag: "PROGRAMMES_ENABLED",
    mobileOnly: true,
  },
];

/**
 * Items whose feature flag is enabled (or that carry none), children filtered the same way.
 * An item left with no visible child loses its `children` key.
 */
export function filterNavItems(items: NavItem[], enabledFlags: ReadonlySet<string>): NavItem[] {
  const visible = (item: NavItem) => !item.featureFlag || enabledFlags.has(item.featureFlag);
  return items.filter(visible).map((item) => {
    if (!item.children) return item;
    const { children, ...rest } = item;
    const shown = children.filter(visible);
    return shown.length > 0 ? { ...rest, children: shown } : rest;
  });
}

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
  // No Boussole here: the mobile menu already shows it next to the theme toggle. Neither
  // Fact-checks nor Mon député: both are reached from NAV_PRIMARY.
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

// Mobile menu, grouped by what the reader is trying to do. The four sections of the tab bar
// (NAV_TABS) are left out: the bar already holds them. Search is the field at the top of the menu.
export const NAV_MENU_GROUPS: NavGroup[] = [
  {
    label: "Près de chez moi",
    items: [
      { href: TERRITOIRES_PATH, label: "Ma commune" },
      { href: "/mon-depute", label: "Mon député", featureFlag: "MON_DEPUTE_SECTION" },
      { href: TERRITOIRES_DEPARTEMENTS_PATH, label: "Départements" },
      { href: TERRITOIRES_REGIONS_ANCHOR, label: "Régions" },
    ],
  },
  {
    label: "Comprendre et comparer",
    items: [
      { href: "/statistiques", label: "Statistiques", featureFlag: "STATISTIQUES_SECTION" },
      { href: "/factchecks", label: "Fact-checks" },
      { href: "/programmes", label: "Programmes", featureFlag: "PROGRAMMES_ENABLED" },
      { href: "/partis", label: "Partis" },
      { href: "/comparer", label: "Comparer", featureFlag: "COMPARISON_TOOL" },
      { href: "/politiques/gouvernements", label: "Gouvernements", featureFlag: "gouvernements" },
      { href: "/parlement/groupes", label: "Groupes parlementaires" },
      { href: "/procedures-baillons", label: "Procédures-bâillons" },
    ],
  },
  {
    label: "Mes outils",
    items: [
      { href: "/mon-observatoire", label: "Mon Observatoire" },
      { href: "/chat", label: "Assistant IA", featureFlag: "CHATBOT_ENABLED" },
    ],
  },
];

/** The menu groups with their flagged items filtered, groups left empty dropped. */
export function filterNavGroups(groups: NavGroup[], enabledFlags: ReadonlySet<string>): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: filterNavItems(group.items, enabledFlags) }))
    .filter((group) => group.items.length > 0);
}

export type TabIcon = "users" | "landmark" | "scale" | "vote";

export interface TabNavItem {
  href: string;
  /** Short enough to fit a fifth of a 320px screen on one line */
  label: string;
  /** Spoken name, when the visible label is too terse to stand alone */
  ariaLabel?: string;
  icon: TabIcon;
  /** Path prefix that lights the tab: a tab stands for its whole section, not for one page */
  match: string;
}

// Bottom tab bar, below `lg`. Four links to existing pages; the menu button is added by the
// component. The fourth slot follows the election put forward: it goes back to /programmes once
// the presidential ballot has been held.
export const NAV_TABS: TabNavItem[] = [
  { href: "/politiques", label: "Élus", icon: "users", match: "/politiques" },
  { href: "/parlement/votes", label: "Votes", icon: "landmark", match: "/parlement" },
  { href: "/affaires", label: "Affaires", icon: "scale", match: "/affaires" },
  {
    href: "/elections/presidentielle-2027",
    label: "2027",
    ariaLabel: "Présidentielle 2027",
    icon: "vote",
    match: "/elections/presidentielle-2027",
  },
];

/** The `href` of the tab whose section holds `pathname`, or null outside of the four sections. */
export function getActiveTabHref(pathname: string): string | null {
  const tab = NAV_TABS.find(({ match }) => pathname === match || pathname.startsWith(`${match}/`));
  return tab?.href ?? null;
}

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
      { href: "/politiques/gouvernements", label: "Gouvernements", featureFlag: "gouvernements" },
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
      { href: "/parlement/assemblee-nationale", label: "Assemblée nationale" },
      { href: "/parlement/senat", label: "Sénat" },
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
      { href: TERRITOIRES_PATH, label: "Territoires" },
      { href: TERRITOIRES_DEPARTEMENTS_PATH, label: "Départements" },
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
      { href: "/changelog", label: "Journal des évolutions" },
      { href: "/docs/api", label: "API" },
      { href: "/espace-presse", label: "Presse et partenaires" },
      {
        href: "https://boussole.poligraph.fr",
        label: "Boussole",
        external: true,
        featureFlag: "BOUSSOLE_ENABLED",
      },
      { href: "/soutenir", label: "Nous soutenir" },
      { href: "/confidentialite", label: "Confidentialité" },
      { href: "/conditions-utilisation", label: "Conditions d'utilisation" },
      { href: "/support", label: "Support" },
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
  { href: TERRITOIRES_DEPARTEMENTS_PATH, label: "Départements" },
  { href: "/institutions", label: "Institutions" },
  { href: "/sources", label: "Sources" },
  { href: "/methodologie", label: "Méthodologie" },
  { href: "/docs/api", label: "API" },
  { href: "/mentions-legales", label: "Mentions légales" },
] as const;

export type NavLink = (typeof NAV_LINKS)[number];
export type FooterLink = (typeof FOOTER_LINKS)[number];
