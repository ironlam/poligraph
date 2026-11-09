/**
 * Comparaison des dates de mandat de sénateur avec la table officielle du Sénat
 * (ODSEN_ELUSEN.csv, un mandat par ligne). Fonctions pures, sans accès réseau ni base.
 */

export const ELUSEN_URL = "https://data.senat.fr/data/senateurs/ODSEN_ELUSEN.csv";

export interface OfficialTerm {
  /** Jour de début (YYYY-MM-DD). */
  start: string;
  /** Jour de fin (YYYY-MM-DD), null si le mandat est en cours. */
  end: string | null;
  motif: string;
}

export interface DbMandate {
  id: string;
  externalId: string | null;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
}

export type AuditStatus =
  | "OK"
  | "WRONG_START"
  | "WRONG_END"
  | "MULTI_TERM"
  | "NO_TERM"
  | "UNKNOWN_MATRICULE";

export interface AuditResult {
  status: AuditStatus;
  mandate: DbMandate;
  matricule: string;
  official?: OfficialTerm;
}

/** Les dates sont stockées à minuit UTC : on compare des jours, pas des instants. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lit une ligne CSV avec champs entre guillemets (guillemet doublé = guillemet littéral). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function dayOrNull(value: string | undefined): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : null;
}

/**
 * Décode le CSV officiel (déjà en UTF-8) et groupe les mandats par matricule.
 * Les lignes `%` sont les commentaires de la requête ; l'en-tête sert à repérer les colonnes.
 */
export function parseElusen(csv: string): Map<string, OfficialTerm[]> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("%"));
  const header = parseCsvLine(lines[0] ?? "");
  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx < 0) throw new Error(`Colonne absente du CSV du Sénat : « ${name} »`);
    return idx;
  };
  const iMat = col("Matricule");
  const iStart = col("Date de début de mandat");
  const iEnd = col("Date de fin de mandat");
  const iMotif = col("Motif début de mandat");

  const terms = new Map<string, OfficialTerm[]>();
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const matricule = f[iMat]?.trim();
    const start = dayOrNull(f[iStart]);
    if (!matricule || !start) continue;
    const list = terms.get(matricule) ?? [];
    list.push({ start, end: dayOrNull(f[iEnd]), motif: f[iMotif]?.trim() ?? "" });
    terms.set(matricule, list);
  }
  return terms;
}

export function matriculeOf(externalId: string | null): string | null {
  const m = externalId?.match(/^senat-(.+)$/);
  return m ? m[1]! : null;
}

/**
 * Compare un mandat de la base aux mandats officiels du même matricule.
 * On ne corrige que s'il n'y a qu'un seul terme officiel qui recoupe le mandat
 * (en ignorant un terme précédent qui finit le jour du début). Un mandat de la base
 * qui fusionne plusieurs termes est signalé MULTI_TERM, jamais jugé faux.
 */
export function auditMandate(mandate: DbMandate, terms: Map<string, OfficialTerm[]>): AuditResult {
  const matricule = matriculeOf(mandate.externalId) ?? "";
  const official = terms.get(matricule);
  if (!official) return { status: "UNKNOWN_MATRICULE", mandate, matricule };

  const dbStart = toDay(mandate.startDate);
  const dbEnd = mandate.endDate ? toDay(mandate.endDate) : null;
  const overlapping = official.filter(
    (t) => t.start <= (dbEnd ?? "9999-12-31") && (t.end === null || t.end >= dbStart)
  );

  // Le terme précédent qui s'arrête le jour même où le mandat de la base commence ne
  // compte pas : c'est le cas d'un écart d'un jour, pas d'un mandat fusionné.
  const strict = overlapping.filter((t) => t.end === null || t.end > dbStart);
  const candidates = strict.length > 0 ? strict : overlapping;
  const term = candidates.length === 1 ? candidates[0] : undefined;
  if (!term) {
    return { status: overlapping.length === 0 ? "NO_TERM" : "MULTI_TERM", mandate, matricule };
  }
  if (term.start !== dbStart) return { status: "WRONG_START", mandate, matricule, official: term };
  if (!mandate.isCurrent && term.end !== null && dbEnd !== null && term.end !== dbEnd) {
    return { status: "WRONG_END", mandate, matricule, official: term };
  }
  return { status: "OK", mandate, matricule, official: term };
}
