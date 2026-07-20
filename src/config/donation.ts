export type RescritStatus = "pending" | "in_review" | "validated";

// Statut du rescrit fiscal Sankofa au 2026-05-16. À ajuster ici quand l'admin Sankofa avance.
export const RESCRIT_STATUS: RescritStatus = "in_review";

export type Expense = {
  label: string;
  monthlyEuros: number;
  description: string;
};

export const EXPENSES = [
  {
    label: "Hébergement (Vercel Pro)",
    monthlyEuros: 20,
    description: "Serveurs, CDN, certificats SSL",
  },
  {
    label: "APIs IA (Anthropic, OpenAI)",
    monthlyEuros: 50,
    description: "Résumés automatiques, chatbot, embeddings",
  },
  {
    label: "Base de données (Supabase)",
    monthlyEuros: 25,
    description: "PostgreSQL, stockage, backups",
  },
  {
    label: "Domaine et services",
    monthlyEuros: 10,
    description: "Nom de domaine, emails, monitoring",
  },
] as const satisfies readonly Expense[];

export function totalMonthlyEuros(): number {
  return EXPENSES.reduce((sum, e) => sum + e.monthlyEuros, 0);
}

// --- HelloAsso embedded widget ---
export const HELLOASSO_ORIGIN = "https://www.helloasso.com";
const HELLOASSO_WIDGET_BASE =
  "https://www.helloasso.com/associations/association-sankofa/formulaires/1/widget";

// Whether HelloAsso pre-fills amount/frequency from URL params.
// Stays "unsupported" until verified in the HelloAsso admin (see spec §7).
export type DonationPrefillMode = "unsupported" | "verified";
export const DONATION_PREFILL_MODE: DonationPrefillMode = "unsupported";

export type DonationFrequency = "monthly" | "one-time";

// Builds the embedded form URL. In "unsupported" mode, options are ignored.
export function buildDonationWidgetUrl(options?: {
  frequency?: DonationFrequency;
  amountEuros?: number;
}): string {
  const url = new URL(HELLOASSO_WIDGET_BASE);
  url.searchParams.set("view", "form");
  if (DONATION_PREFILL_MODE === "verified" && options) {
    // Param names to confirm in the HelloAsso admin before flipping the mode.
    if (options.frequency) url.searchParams.set("frequency", options.frequency);
    if (options.amountEuros) url.searchParams.set("amount", String(options.amountEuros));
  }
  return url.toString();
}

// --- Monthly tiers ---
export type MonthlyTier = {
  monthlyEuros: number;
  impactLabel: string;
  recommended?: boolean;
};

export const MONTHLY_TIERS = [
  {
    monthlyEuros: 5,
    impactLabel: "Vous contribuez à garder les données à jour.",
    recommended: false,
  },
  {
    monthlyEuros: 10,
    impactLabel: "Vous aidez à faire vivre nos outils d'analyse et de vérification.",
    recommended: true,
  },
  {
    monthlyEuros: 15,
    impactLabel: "Vous soutenez l'enrichissement des explications destinées aux citoyens.",
    recommended: false,
  },
  {
    monthlyEuros: 20,
    impactLabel: "Vous aidez à accélérer l'arrivée de nouvelles fonctionnalités.",
    recommended: false,
  },
  {
    monthlyEuros: 50,
    impactLabel: "Vous aidez à financer des prestations spécialisées ponctuelles.",
    recommended: false,
  },
] as const satisfies readonly MonthlyTier[];

export const ONE_TIME_AMOUNTS = [10, 20, 50, 100] as const;

// --- Mission items ("à quoi sert votre don") ---
export const MISSION_ITEMS = [
  "Tenir les fiches à jour : votes, mandats, déclarations de patrimoine.",
  "Vérifier chaque affaire judiciaire avant publication.",
  "Ajouter de nouvelles données : scrutins, élections locales.",
  "Faire avancer la feuille de route et l'ouverture de l'API.",
] as const satisfies readonly string[];

// --- Support platforms (single beneficiary: Sankofa) ---
export type SupportPlatform = {
  id: "helloasso" | "tipeee" | "github-sponsors" | "kofi";
  displayName: string;
  description: string;
  url?: string;
  enabled: boolean;
  beneficiaryLabel: string;
  taxReceiptChannel: "association" | "unavailable";
  primary: boolean;
};

export const SUPPORT_PLATFORMS = [
  {
    id: "helloasso",
    displayName: "HelloAsso",
    description: "Don ponctuel ou mensuel à l'association Sankofa, sans commission.",
    url: "https://www.helloasso.com/associations/association-sankofa/formulaires/1",
    enabled: true,
    beneficiaryLabel: "Association Sankofa",
    taxReceiptChannel: "association",
    primary: true,
  },
  {
    id: "tipeee",
    displayName: "Tipeee",
    description: "Soutien récurrent, versé à l'association.",
    url: "https://fr.tipeee.com/poligraph",
    enabled: true,
    beneficiaryLabel: "Association Sankofa",
    taxReceiptChannel: "unavailable",
    primary: false,
  },
  {
    id: "github-sponsors",
    displayName: "GitHub Sponsors",
    description: "Pour les développeurs, depuis le dépôt open source.",
    url: undefined,
    enabled: false,
    beneficiaryLabel: "Association Sankofa",
    taxReceiptChannel: "unavailable",
    primary: false,
  },
  {
    id: "kofi",
    displayName: "Ko-fi",
    description: "Un don rapide et ponctuel, pratique à l'international.",
    url: undefined,
    enabled: false,
    beneficiaryLabel: "Association Sankofa",
    taxReceiptChannel: "unavailable",
    primary: false,
  },
] as const satisfies readonly SupportPlatform[];

const helloassoPlatform = SUPPORT_PLATFORMS.find((p) => p.id === "helloasso");
if (!helloassoPlatform?.url) {
  throw new Error("SUPPORT_PLATFORMS must include a HelloAsso platform with a url");
}
// Resolved once at module load so consumers do not repeat the lookup + non-null assertions.
export const HELLOASSO_FORM_URL: string = helloassoPlatform.url;

export function activeSecondaryPlatforms(): readonly SupportPlatform[] {
  return SUPPORT_PLATFORMS.filter((p) => !p.primary && p.enabled && Boolean(p.url));
}

// Tax-receipt copy derived from the single source of truth RESCRIT_STATUS.
export function taxReceiptMessage(): string {
  switch (RESCRIT_STATUS) {
    case "validated":
      return "Reçu fiscal automatique : votre don est déductible à 66% de votre impôt sur le revenu (60% pour les entreprises).";
    case "in_review":
    case "pending":
      return "Les dons ne donnent pas actuellement lieu à un reçu fiscal. Une demande de rescrit mécénat est en cours.";
  }
}
