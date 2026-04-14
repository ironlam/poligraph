import type { MandateType, AffairStatus } from "@/generated/prisma";

export const MANDAT_BUCKETS: Record<string, MandateType[]> = {
  depute: ["DEPUTE", "DEPUTE_EUROPEEN"],
  senateur: ["SENATEUR"],
  gouvernement: [
    "PRESIDENT_REPUBLIQUE",
    "PREMIER_MINISTRE",
    "MINISTRE",
    "SECRETAIRE_ETAT",
    "MINISTRE_DELEGUE",
  ],
  locaux: [
    "MAIRE",
    "ADJOINT_MAIRE",
    "PRESIDENT_REGION",
    "PRESIDENT_DEPARTEMENT",
    "CONSEILLER_REGIONAL",
    "CONSEILLER_DEPARTEMENTAL",
    "CONSEILLER_MUNICIPAL",
  ],
};

export type MandatBucket = keyof typeof MANDAT_BUCKETS;

export const CERTAINTY_STATUS: Record<"etabli" | "prononcee" | "tous", AffairStatus[] | "all"> = {
  etabli: ["CONDAMNATION_DEFINITIVE"],
  // APPEL_EN_COURS is included because Poligraph convention is: appeal filed
  // AFTER first-instance conviction. Marginal "acquittal + prosecution appeal"
  // cases are rare and remain visible in the `sentence` field.
  prononcee: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"],
  tous: "all",
};

export type CertaintyKey = keyof typeof CERTAINTY_STATUS;

export interface CondamnationsFilters {
  mandat?: MandatBucket;
  certainty?: CertaintyKey;
  partiSlug?: string;
  page?: number;
  sort?: "date" | "nom" | "severity";
}
