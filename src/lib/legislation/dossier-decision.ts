/**
 * Statut d'un dossier à partir de sa dernière décision, lue dans
 * `statutConclusion` des actes de décision de l'open data AN.
 *
 * Le code d'un acte de décision (`AN1-DEBATS-DEC`) ne dit pas si le texte a été
 * adopté ou rejeté : seul `statutConclusion.libelle` le dit. Un rejet n'a pas
 * le même sens selon la suite : le texte meurt (proposition de loi rejetée),
 * ou il continue (loi de finances rejetée en 1re lecture à l'AN, dont le texte
 * initial part au Sénat).
 */

export interface DecisionActe {
  codeActe: string;
  dateActe: string | null;
  statutConclusion?: { libelle?: string | null } | null;
  actesLegislatifs?: { acteLegislatif: DecisionActe | DecisionActe[] } | null;
}

export type RejectionStatus = "REJETE" | "REJETE_NAVETTE";

export function isRejectionConclusion(libelle: string | null | undefined): boolean {
  return typeof libelle === "string" && /\brejet/i.test(libelle);
}

function flatten(actes: DecisionActe | DecisionActe[] | null | undefined): DecisionActe[] {
  if (!actes) return [];
  const list = Array.isArray(actes) ? actes : [actes];
  return list.flatMap((a) => [a, ...flatten(a.actesLegislatifs?.acteLegislatif)]);
}

function time(acte: DecisionActe): number {
  return acte.dateActe ? Date.parse(acte.dateActe) : Number.NaN;
}

/** "AN1-DEBATS-DEC" -> "AN1" : l'étape (assemblée + lecture) d'un acte. */
function stageOf(code: string): string {
  return code.split("-")[0] ?? code;
}

// Observé sur toute la 17e législature : chaque loi de finances, de financement
// de la sécurité sociale ou de finances rectificative rejetée en 1re lecture à
// l'AN a ensuite été examinée par le Sénat (8 cas sur 8). Le Sénat ne figure
// pourtant dans l'open data qu'une fois sa séance ouverte, d'où cette règle.
function isFinanceBill(procedureLabel: string | null | undefined): boolean {
  return /loi de finances|financement de la sécurité sociale/i.test(procedureLabel ?? "");
}

export function rejectionStatus(
  actes: DecisionActe | DecisionActe[] | null | undefined,
  procedureLabel: string | null | undefined
): RejectionStatus | null {
  const all = flatten(actes);

  const decisions = all
    .filter(
      (a) =>
        a.codeActe.endsWith("-DEC") &&
        Boolean(a.statutConclusion?.libelle) &&
        Number.isFinite(time(a))
    )
    // Tri stable : à date égale, l'ordre de la source départage.
    .sort((a, b) => time(a) - time(b));
  const last = decisions[decisions.length - 1];
  if (!last || !isRejectionConclusion(last.statutConclusion?.libelle)) return null;

  const stage = stageOf(last.codeActe);
  const movedOn = all.some(
    (a) => Number.isFinite(time(a)) && time(a) > time(last) && stageOf(a.codeActe) !== stage
  );
  if (movedOn) return "REJETE_NAVETTE";
  if (stage === "AN1" && isFinanceBill(procedureLabel)) return "REJETE_NAVETTE";
  return "REJETE";
}
