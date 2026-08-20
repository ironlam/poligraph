import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  CheckSquare,
  CopyCheck,
  FileCheck2,
  FileText,
  HeartPulse,
  History,
  LayoutDashboard,
  ListChecks,
  Newspaper,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  ShieldX,
  Share2,
  ToggleLeft,
  Users,
  Vote,
  Crown,
  Fingerprint,
} from "lucide-react";

export type AdminNavigationGroupId = "todo" | "content" | "quality" | "operations";

export type AdminCounterKey =
  | "drafts.affairs"
  | "drafts.politicians"
  | "moderation.proposalsPending"
  | "moderation.proposalsConflict"
  | "moderation.reviewsPending"
  | "matching.decisionsPending"
  | "matching.articlesPending"
  | "matching.duplicatesPending"
  | "press.rejectionsPending"
  | "operations.failedPipelines"
  | "operations.failedSyncs";

export interface AdminNavigationEntry {
  id: string;
  href: string;
  label: string;
  description: string;
  group: AdminNavigationGroupId;
  icon: LucideIcon;
  counterKey?: AdminCounterKey;
  aliases?: readonly string[];
  breadcrumb?: string;
  query?: Readonly<Record<string, string>>;
}

export interface AdminNavigationGroup {
  id: AdminNavigationGroupId;
  label: string;
  description: string;
  items: readonly AdminNavigationEntry[];
}

const entries: readonly AdminNavigationEntry[] = [
  {
    id: "dashboard",
    href: "/admin",
    label: "À traiter",
    description: "Les files qui demandent une décision humaine.",
    group: "todo",
    icon: LayoutDashboard,
    breadcrumb: "À traiter maintenant",
  },
  {
    id: "politicians",
    href: "/admin/politiques",
    label: "Personnalités politiques",
    description: "Profils, mandats et données biographiques.",
    group: "content",
    icon: Users,
    counterKey: "drafts.politicians",
  },
  {
    id: "parties",
    href: "/admin/partis",
    label: "Partis",
    description: "Partis politiques et rattachements.",
    group: "content",
    icon: Building2,
  },
  {
    id: "affairs",
    href: "/admin/affaires",
    label: "Affaires",
    description: "Affaires judiciaires et publication.",
    group: "content",
    icon: Scale,
    counterKey: "drafts.affairs",
    aliases: ["/admin/affaires/[id]"],
  },
  {
    id: "press",
    href: "/admin/presse",
    label: "Presse et articles",
    description: "Articles de presse et mentions détectées.",
    group: "content",
    icon: Newspaper,
  },
  {
    id: "legislative-files",
    href: "/admin/dossiers",
    label: "Dossiers législatifs",
    description: "Dossiers et textes parlementaires.",
    group: "content",
    icon: FileText,
  },
  {
    id: "measures",
    href: "/admin/mesures",
    label: "Mesures et programmes",
    description: "Mesures, programmes et engagements.",
    group: "content",
    icon: ListChecks,
  },
  {
    id: "candidates",
    href: "/admin/candidats",
    label: "Candidatures",
    description: "Candidatures et comparaisons.",
    group: "content",
    icon: CheckSquare,
  },
  {
    id: "mayors",
    href: "/admin/maires",
    label: "Maires",
    description: "Données municipales.",
    group: "content",
    icon: Crown,
  },
  {
    id: "factchecks",
    href: "/admin/factchecks",
    label: "Fact-checks",
    description: "Fact-checks issus de sources autorisées.",
    group: "content",
    icon: ShieldCheck,
  },
  {
    id: "social",
    href: "/admin/social",
    label: "Social",
    description: "Sources et publications sociales.",
    group: "content",
    icon: Share2,
  },
  {
    id: "promises",
    href: "/admin/promises",
    label: "Promesses",
    description: "Promesses de campagne à vérifier.",
    group: "content",
    icon: FileCheck2,
  },
  {
    id: "newsletter",
    href: "/admin/newsletter",
    label: "Newsletter",
    description: "Éditions de la newsletter.",
    group: "content",
    icon: Newspaper,
  },
  {
    id: "articles-affairs",
    href: "/admin/liaisons/articles-affaires",
    label: "Articles ↔ affaires",
    description: "Articles analysés sans liaison détectée.",
    group: "quality",
    icon: FileCheck2,
    counterKey: "matching.articlesPending",
  },
  {
    id: "affairs-politicians",
    href: "/admin/liaisons/affaires-personnalites",
    label: "Affaires ↔ personnalités",
    description: "Décisions de liaison à confirmer.",
    group: "quality",
    icon: Fingerprint,
    counterKey: "matching.decisionsPending",
    aliases: ["/admin/affair-matching/review"],
  },
  {
    id: "affairs-decisions",
    href: "/admin/affaires?filter=no-ecli",
    label: "Affaires ↔ décisions judiciaires",
    description: "Propositions issues des références judiciaires.",
    group: "quality",
    icon: Scale,
  },
  {
    id: "proposals",
    href: "/admin/affaires/propositions",
    label: "Propositions",
    description: "Modifications à examiner avant application.",
    group: "quality",
    icon: Activity,
    counterKey: "moderation.proposalsPending",
  },
  {
    id: "duplicates",
    href: "/admin/affaires/doublons",
    label: "Doublons",
    description: "Paires d’affaires à comparer et trancher.",
    group: "quality",
    icon: CopyCheck,
    counterKey: "matching.duplicatesPending",
  },
  {
    id: "scrutin-titles",
    href: "/admin/policy-titles",
    label: "Titres de scrutins",
    description: "Titres et liaisons des scrutins.",
    group: "quality",
    icon: Vote,
  },
  {
    id: "press-rejections",
    href: "/admin/press/rejections",
    label: "Rejets presse",
    description: "Rejets nécessitant une décision éditoriale.",
    group: "quality",
    icon: ShieldX,
    counterKey: "press.rejectionsPending",
  },
  {
    id: "matching-dashboard",
    href: "/admin/affair-matching/dashboard",
    label: "Activité des liaisons",
    description: "Suivi agrégé du registre de liaison.",
    group: "quality",
    icon: BarChart3,
  },
  {
    id: "pipelines",
    href: "/admin/pipelines",
    label: "Pipelines",
    description: "Santé et échecs des pipelines.",
    group: "operations",
    icon: HeartPulse,
    counterKey: "operations.failedPipelines",
  },
  {
    id: "syncs",
    href: "/admin/syncs",
    label: "Synchronisations",
    description: "Exécutions et échecs de synchronisation.",
    group: "operations",
    icon: RefreshCw,
    counterKey: "operations.failedSyncs",
  },
  {
    id: "audit",
    href: "/admin/audit",
    label: "Journal d’audit",
    description: "Historique des actions administratives.",
    group: "operations",
    icon: History,
    aliases: ["/admin/audit/bio-quality"],
  },
  {
    id: "feature-toggles",
    href: "/admin/feature-toggles",
    label: "Fonctionnalités expérimentales",
    description: "Activation contrôlée des fonctionnalités en test.",
    group: "operations",
    icon: ToggleLeft,
  },
  {
    id: "settings",
    href: "/admin/parametres",
    label: "Paramètres",
    description: "Configuration de l’administration.",
    group: "operations",
    icon: Settings,
  },
];

export const ADMIN_NAVIGATION_GROUPS: readonly AdminNavigationGroup[] = [
  {
    id: "todo",
    label: "À traiter",
    description: "Files de travail",
    items: entries.filter((e) => e.group === "todo"),
  },
  {
    id: "content",
    label: "Contenus",
    description: "Production éditoriale",
    items: entries.filter((e) => e.group === "content"),
  },
  {
    id: "quality",
    label: "Qualité et liaisons",
    description: "Contrôles et rapprochements",
    items: entries.filter((e) => e.group === "quality"),
  },
  {
    id: "operations",
    label: "Opérations",
    description: "Santé et administration",
    items: entries.filter((e) => e.group === "operations"),
  },
];

export const ADMIN_NAVIGATION = entries;

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isAdminNavigationActive(pathname: string, entry: AdminNavigationEntry): boolean {
  const route = entry.href.split("?")[0] ?? "/admin";
  if (route === "/admin") return pathname === "/admin";
  if (entry.id === "affairs") {
    return (
      pathMatches(pathname, route) &&
      !["/admin/affaires/propositions", "/admin/affaires/doublons", "/admin/affaires/nouveau"].some(
        (excluded) => pathMatches(pathname, excluded)
      )
    );
  }
  return (
    pathMatches(pathname, route) ||
    (entry.aliases ?? []).some((alias) => pathMatches(pathname, alias))
  );
}

export function findAdminNavigationEntry(pathname: string): AdminNavigationEntry | undefined {
  return [...ADMIN_NAVIGATION]
    .filter((entry) => isAdminNavigationActive(pathname, entry))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function getCounterValue(
  counters: Record<string, number>,
  key: AdminCounterKey | undefined
): number | undefined {
  return key ? (counters[key] ?? 0) : undefined;
}
