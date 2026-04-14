import type { MandatBucket, CertaintyKey } from "@/lib/data/condamnations";

const MANDAT_LABEL: Record<MandatBucket | "default", string> = {
  depute: "Députés français",
  senateur: "Sénateurs français",
  gouvernement: "Ministres",
  locaux: "Élus locaux",
  default: "Responsables politiques français",
};

const CERTAINTY_LABEL: Record<CertaintyKey, string> = {
  etabli: "condamnés définitivement",
  prononcee: "condamnés en première instance ou en appel",
  tous: "condamnés",
};

export interface TitleInput {
  mandat?: MandatBucket;
  certainty: CertaintyKey;
  partyName?: string | null;
}

export function buildListTitle(input: TitleInput): string {
  const mandatLabel = MANDAT_LABEL[input.mandat ?? "default"];
  const certaintyLabel = CERTAINTY_LABEL[input.certainty];
  const suffix = input.partyName ? ` \u2014 ${input.partyName}` : "";
  return `${mandatLabel} ${certaintyLabel}${suffix}`;
}

export interface DescriptionInput {
  mandat?: MandatBucket;
  certainty: CertaintyKey;
  view: "list" | "stats";
  partyName?: string | null;
  totalDefinitif: number;
  totalPrononce: number;
}

export function buildDescription(input: DescriptionInput): string {
  if (input.view === "stats") {
    return `Taux de condamnation par parti politique en France. Agrégation des responsables politiques condamnés définitivement, méthodologie transparente et sources vérifiables.`;
  }

  if (input.mandat) {
    const label = MANDAT_LABEL[input.mandat].toLowerCase();
    return `Liste sourcée des ${label} condamnés définitivement ou en cours de procédure. ${input.totalDefinitif} condamnations définitives documentées, présomption d'innocence respectée.`;
  }

  return `${input.totalDefinitif} responsables politiques français condamnés définitivement et ${input.totalPrononce} en première instance ou en appel. Sources vérifiables, mise à jour régulière.`;
}

export interface CanonicalInput {
  mandat?: MandatBucket;
  certainty: CertaintyKey;
  partiSlug?: string;
  view: "list" | "stats";
  page?: number;
}

export function buildCanonical(input: CanonicalInput): string {
  const { mandat, certainty, partiSlug, view } = input;

  if (partiSlug && !mandat && certainty === "tous" && view === "list") {
    return `/affaires/parti/${partiSlug}`;
  }

  const params = new URLSearchParams();
  if (mandat) params.set("mandat", mandat);
  if (certainty !== "tous") params.set("certainty", certainty);
  if (partiSlug) params.set("parti", partiSlug);
  if (view === "stats") params.set("view", "stats");

  const qs = params.toString();
  return `/affaires/condamnations${qs ? `?${qs}` : ""}`;
}
