import type { SenateVoteSourceCode } from "@/lib/votes/senate-participation";

/**
 * Corrections of the nominative file published by the Senate, read from the official page of
 * each scrutin: its lists by group give the totals it announces, the file differs on these rows.
 * A correction applies only while the file still carries the value in `from`. Once the totals
 * of the page are met, the scrutin is imported; otherwise it stays refused.
 * `certain: false` marks the rows for which the page states no reason.
 */
export interface SenateVoteCorrection {
  scrutin: string;
  matricule: string;
  from: SenateVoteSourceCode;
  to: SenateVoteSourceCode;
  reason: string;
  certain: boolean;
}

const REASON_GOVERNMENT = "Membre du Gouvernement, ne peut prendre part au vote";
const REASON_PRESIDING = "Président de séance";
const REASON_PRESIDING_F = "Présidente de séance";
const REASON_NON_PARTICIPANT = "Non-participant sur la page officielle, motif non précisé";
const REASON_REVERSED =
  "Pour sur la page officielle, non-votante dans le fichier, motif non précisé";

export const SENATE_VOTE_CORRECTIONS: SenateVoteCorrection[] = [
  {
    scrutin: "SENAT-2024-93",
    matricule: "14031R",
    from: "c",
    to: "n",
    reason: REASON_PRESIDING,
    certain: true,
  }, // Didier Mandelli
  {
    scrutin: "SENAT-2024-93",
    matricule: "14229S",
    from: "n",
    to: "p",
    reason: REASON_REVERSED,
    certain: false,
  }, // Sylvie Robert
  {
    scrutin: "SENAT-2024-150",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-151",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-152",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-153",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-154",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-155",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-156",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-157",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-158",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-159",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-160",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-161",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-162",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-163",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-164",
    matricule: "20136B",
    from: "p",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-165",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-166",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-167",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-168",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-169",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-170",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-171",
    matricule: "20136B",
    from: "c",
    to: "n",
    reason: REASON_GOVERNMENT,
    certain: true,
  }, // Philippe Tabarot
  {
    scrutin: "SENAT-2024-196",
    matricule: "11074Q",
    from: "c",
    to: "n",
    reason: REASON_NON_PARTICIPANT,
    certain: false,
  }, // Vincent Eble
  {
    scrutin: "SENAT-2024-196",
    matricule: "20070A",
    from: "c",
    to: "n",
    reason: REASON_NON_PARTICIPANT,
    certain: false,
  }, // Thierry Cozic
  {
    scrutin: "SENAT-2025-25",
    matricule: "14229S",
    from: "p",
    to: "n",
    reason: REASON_PRESIDING_F,
    certain: true,
  }, // Sylvie Robert
  {
    scrutin: "SENAT-2025-26",
    matricule: "14229S",
    from: "p",
    to: "n",
    reason: REASON_PRESIDING_F,
    certain: true,
  }, // Sylvie Robert
  {
    scrutin: "SENAT-2025-27",
    matricule: "14229S",
    from: "p",
    to: "n",
    reason: REASON_PRESIDING_F,
    certain: true,
  }, // Sylvie Robert
  {
    scrutin: "SENAT-2025-28",
    matricule: "14229S",
    from: "c",
    to: "n",
    reason: REASON_PRESIDING_F,
    certain: true,
  }, // Sylvie Robert
  {
    scrutin: "SENAT-2025-56",
    matricule: "14111D",
    from: "p",
    to: "n",
    reason: REASON_PRESIDING,
    certain: true,
  }, // Alain Marc
  {
    scrutin: "SENAT-2025-293",
    matricule: "21076L",
    from: "p",
    to: "n",
    reason: REASON_NON_PARTICIPANT,
    certain: false,
  }, // Louis Vogel
];
