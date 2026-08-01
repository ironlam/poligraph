import { MANDATE_TYPE_LABELS, feminizeRole } from "@/config/labels";
import type { MandateType } from "@/generated/prisma";

/**
 * Meta line for the affair context band ("Sénatrice · Moselle · Sénat · en
 * mandat depuis 2017"). Pure so it unit-tests without a database. Shows only
 * what is known (MissingData: no fabricated segment for an absent field).
 */
const CHAMBER_BY_TYPE: Partial<Record<MandateType, string>> = {
  DEPUTE: "Assemblée nationale",
  SENATEUR: "Sénat",
  DEPUTE_EUROPEEN: "Parlement européen",
};

const PARLIAMENTARY_TYPES: MandateType[] = ["DEPUTE", "SENATEUR", "DEPUTE_EUROPEEN"];

export interface DisplayMandate {
  type: MandateType;
  constituency: string | null;
  startDate: Date | null;
}

/** Prefer a parliamentary mandate (the one that names a chamber), else the first. */
export function pickDisplayMandate(mandates: DisplayMandate[]): DisplayMandate | null {
  return mandates.find((m) => PARLIAMENTARY_TYPES.includes(m.type)) ?? mandates[0] ?? null;
}

export function formatMandateMeta(
  mandate: DisplayMandate | null,
  civility: string | null
): string | null {
  if (!mandate) return null;

  const parts: string[] = [feminizeRole(MANDATE_TYPE_LABELS[mandate.type], civility)];

  if (mandate.constituency) {
    const dept = mandate.constituency.match(/^([^(]+)/)?.[1]?.trim();
    if (dept) parts.push(dept);
  }

  const chamber = CHAMBER_BY_TYPE[mandate.type];
  if (chamber) parts.push(chamber);

  if (mandate.startDate) {
    parts.push(`en mandat depuis ${new Date(mandate.startDate).getFullYear()}`);
  }

  return parts.join(" · ");
}
