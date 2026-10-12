import type { CandidacyStatus } from "@/generated/prisma";

/** Editorial marker stored in CandidacyPresidential.withdrewReason. */
export const PRIMARY_DEFEAT_REASON = "Défaite à la primaire";

const PRIMARY_DEFEAT_REASONS = new Set([
  PRIMARY_DEFEAT_REASON.toLocaleLowerCase("fr"),
  "battu à la primaire",
  "battue à la primaire",
]);

/** A primary defeat is an end to a candidacy, never a personal withdrawal. */
export function isPrimaryDefeat(
  status: CandidacyStatus | null,
  withdrewReason: string | null | undefined
): boolean {
  return (
    status === "RETIRE" &&
    withdrewReason !== null &&
    withdrewReason !== undefined &&
    PRIMARY_DEFEAT_REASONS.has(withdrewReason.trim().toLocaleLowerCase("fr"))
  );
}
