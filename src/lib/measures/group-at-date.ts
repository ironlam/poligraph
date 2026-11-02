import type { Chamber, MandateType } from "@/generated/prisma";

export interface MandateWindow {
  type: MandateType;
  startDate: Date;
  endDate: Date | null;
  group: { id: string; code: string; name: string; chamber: Chamber; legislature: number | null };
}

const MANDATE_TYPE_BY_CHAMBER: Record<Chamber, MandateType> = {
  AN: "DEPUTE",
  SENAT: "SENATEUR",
};

/** Group the candidate sat in at `date`, from the parliamentary mandate covering that day. */
export function groupAtDate(
  mandates: MandateWindow[],
  chamber: Chamber,
  date: Date
): MandateWindow["group"] | null {
  const hit = mandates.find(
    (m) =>
      m.type === MANDATE_TYPE_BY_CHAMBER[chamber] &&
      m.startDate <= date &&
      (m.endDate === null || m.endDate >= date)
  );
  return hit?.group ?? null;
}
