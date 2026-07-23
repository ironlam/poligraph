import type { JudicialCounts } from "./judicial-counts";

export type SignalIconKey =
  | "vote"
  | "mandate"
  | "scale"
  | "gavel"
  | "shield"
  | "users"
  | "filecheck"
  | "wallet"
  | "filetext";
export type SignalTone = "neutral" | "danger" | "warning";
export type Signal = {
  key: string;
  iconKey: SignalIconKey;
  label: string;
  value: string;
  href: string;
  tone: SignalTone;
  primary: boolean;
};

export type SignalsInput = {
  slug: string;
  mandatesCount: number;
  votesTotal: number | null;
  hasVotesTab: boolean;
  hasFactchecksTab: boolean;
  factchecksCount: number;
  dossiersCount: number;
  declarationsCount: number;
  portfolioValue: number | null;
  patrimoineHref: string;
  judicial: JudicialCounts;
};

function tab(slug: string, t: string): string {
  return `/politiques/${slug}?tab=${t}`;
}

// Compact currency for the signal value only (0 stays "0 €"; null handled by caller).
function money(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M€`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} k€`;
  return `${v} €`;
}

export function buildPoliticianSignals(input: SignalsInput): Signal[] {
  const s: Signal[] = [];
  const { slug, judicial: j } = input;

  if (input.hasVotesTab && input.votesTotal != null) {
    s.push({
      key: "votes",
      iconKey: "vote",
      label: "Votes enregistrés",
      value: String(input.votesTotal),
      href: tab(slug, "votes"),
      tone: "neutral",
      primary: true,
    });
  }
  if (input.mandatesCount > 0) {
    s.push({
      key: "mandats",
      iconKey: "mandate",
      label: "Mandats",
      value: String(input.mandatesCount),
      href: tab(slug, "carriere"),
      tone: "neutral",
      primary: true,
    });
  }
  if (j.condamnationsDefinitives > 0) {
    s.push({
      key: "condamnations-definitives",
      iconKey: "scale",
      label: "Condamnations définitives",
      value: String(j.condamnationsDefinitives),
      href: tab(slug, "affaires"),
      tone: "danger",
      primary: true,
    });
  }
  if (j.condamnationsNonDefinitives > 0) {
    s.push({
      key: "condamnations-non-definitives",
      iconKey: "scale",
      label: "Condamnations non définitives",
      value: String(j.condamnationsNonDefinitives),
      href: tab(slug, "affaires"),
      tone: "warning",
      primary: false,
    });
  }
  if (j.proceduresEnCours > 0) {
    s.push({
      key: "procedures",
      iconKey: "gavel",
      label: "Procédures en cours",
      value: String(j.proceduresEnCours),
      href: tab(slug, "affaires"),
      tone: "warning",
      primary: false,
    });
  }
  if (j.victimeOuPlaignant > 0) {
    s.push({
      key: "victime",
      iconKey: "shield",
      label: "Victime / plaignant",
      value: String(j.victimeOuPlaignant),
      href: tab(slug, "affaires"),
      tone: "neutral",
      primary: false,
    });
  }
  if (j.mentionneOuSecondaire > 0) {
    s.push({
      key: "mentionne",
      iconKey: "users",
      label: "Mentionné / secondaire",
      value: String(j.mentionneOuSecondaire),
      href: tab(slug, "affaires"),
      tone: "neutral",
      primary: false,
    });
  }
  if (input.hasFactchecksTab && input.factchecksCount > 0) {
    s.push({
      key: "factchecks",
      iconKey: "filecheck",
      label: "Fact-checks",
      value: String(input.factchecksCount),
      href: tab(slug, "factchecks"),
      tone: "neutral",
      primary: false,
    });
  }
  if (input.declarationsCount > 0) {
    const hasValue = input.portfolioValue != null && input.portfolioValue > 0;
    s.push({
      key: "patrimoine",
      iconKey: "wallet",
      label: hasValue ? "Participations déclarées" : "Déclarations HATVP",
      value: hasValue ? money(input.portfolioValue as number) : String(input.declarationsCount),
      href: input.patrimoineHref,
      tone: "neutral",
      primary: true,
    });
  }
  if (input.dossiersCount > 0) {
    s.push({
      key: "dossiers",
      iconKey: "filetext",
      label: "Propositions de loi",
      value: String(input.dossiersCount),
      href: `/politiques/${slug}#dossiers`,
      tone: "neutral",
      primary: false,
    });
  }
  return s;
}
