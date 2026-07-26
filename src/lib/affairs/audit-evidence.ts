/**
 * Evidence grading for published convictions (#566).
 *
 * Pure logic, extracted from `scripts/audit-convictions.ts` so it can be unit
 * tested: the script calls `main()` at import time and connects to the
 * production database, so importing it from a test is not an option.
 *
 * The script keeps the file I/O and the console output; everything that decides
 * a level or reads a ledger lives here.
 */
import type { AffairStatus, Involvement } from "@/generated/prisma";

/** Roles for which the judicial outcome of the affair is the person's own. */
export const ADVERSE_INVOLVEMENTS: Involvement[] = ["DIRECT", "INDIRECT"];

/** Hôtes de juridictions et d'institutions compétentes. Niveau B. */
export const OFFICIAL_HOSTS = [
  "courdecassation.fr",
  "cours-appel.justice.fr",
  "justice.fr",
  "conseil-etat.fr",
  "ccomptes.fr",
  "legifrance.gouv.fr",
  "conseil-constitutionnel.fr",
  "juricaf.org",
];

/** Éditeurs correspondant à une juridiction ou institution compétente. Niveau B. */
export const OFFICIAL_PUBLISHER =
  /cour d.appel|cour de cassation|conseil d.[ée]tat|cour des comptes|tribunal|parquet|minist[èe]re de la justice|conseil constitutionnel|ordre des/i;

/** Types de source qui ne comptent jamais comme secondaire indépendante.
 *  Wikipedia est exclu délibérément : c'est la source qui a induit en erreur sur
 *  l'arrêt du 7 juillet 2026, et une encyclopédie n'atteste pas un dispositif. */
export const NOT_INDEPENDENT_TYPES = new Set(["WIKIPEDIA", "WIKIDATA"]);

/**
 * Recours encore ouvert, énoncé explicitement.
 *
 * La première version cherchait « pourvoi », « en appel » ou « non définitive »
 * n'importe où, et flaguait 15 affaires à tort : une condamnation définitive raconte
 * normalement son historique (« condamné en appel », « rejet du pourvoi, donnant un
 * caractère définitif »). Mentionner un recours passé n'est pas une contradiction.
 */
export const PENDING_RECOURSE = [
  /pourvoi[^.]{0,60}?(reste possible|est possible|en cours|pendant|a [ée]t[ée] form[ée])/i,
  /(se sont pourvus|s'est pourvu|se pourvoit)[^.]{0,40}cassation/i,
  /appel en cours/i,
  /n['’]est pas d[ée]finitive/i,
];

/**
 * Recours épuisés, énoncé explicitement. Annule le signal de pendance.
 *
 * La forme simple « la condamnation est définitive » a été ajoutée après un faux
 * signalement : le motif ne reconnaissait que l'adverbe « définitivement » et
 * « caractère définitif ». La négation « n'est pas définitive » ne peut pas matcher,
 * le « n'est pas » s'intercalant entre les deux mots recherchés.
 */
export const RECOURSE_EXHAUSTED =
  /rejet[^.]{0,40}pourvoi|pourvoi[^.]{0,40}(rejet|a [ée]t[ée] rejet)|d[ée]finitivement|caract[èe]re d[ée]finitif|voies de recours [ée]puis|condamnation est (aujourd'hui )?d[ée]finitive|devenue d[ée]finitive|rendant la condamnation d[ée]finitive/i;

export function describesPendingRecourse(description: string): boolean {
  if (RECOURSE_EXHAUSTED.test(description)) return false;
  return PENDING_RECOURSE.some((re) => re.test(description));
}

export type EvidenceLevel = "A" | "B" | "C" | "D";

/**
 * Distribution captured on a first pass, the frozen point of comparison.
 *
 * `withoutOfficialSource` keeps its original name and its original meaning:
 * affairs carrying no official `Source` row. Renaming it would silently
 * reinterpret the figure already published on #566.
 */
export interface Baseline extends Record<EvidenceLevel, number> {
  withoutOfficialSource: number;
  capturedAt: string;
}

/**
 * Baseline for the stricter metric, added after `Baseline` and therefore
 * carrying its own capture date: a ledger written before this existed has no
 * historical figure to compare against, and inventing one would be a fiction.
 */
export interface EvidenceBaseline {
  withoutOfficialEvidence: number;
  capturedAt: string;
}

export interface Ledger {
  /** Identifiants d'affaires déjà examinées, dans l'ordre de traitement. */
  done: string[];
  /** Affaires sans ligne Source officielle, au premier passage. */
  baseline?: Baseline;
  /** Affaires sans aucune preuve officielle, à sa propre date de capture. */
  evidenceBaseline?: EvidenceBaseline;
}

/**
 * Read a ledger of any generation. An older file has no `evidenceBaseline`;
 * that absence is preserved rather than filled in, so the report can say the
 * metric has no history yet instead of pretending it was measured.
 */
export function parseLedger(raw: unknown): Ledger {
  const source = (raw ?? {}) as Partial<Ledger>;
  return {
    done: Array.isArray(source.done) ? source.done : [],
    baseline: source.baseline,
    evidenceBaseline: source.evidenceBaseline,
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Titre réduit à sa substance, pour repérer une même dépêche reprise ailleurs. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort()
    .join(" ");
}

export interface SourceRow {
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date;
  sourceType: string;
}

export interface Assessment {
  level: EvidenceLevel;
  /**
   * An official `Source` row is attached. Measures editorial completeness of
   * the visible sourcing: what a reader can click on the page.
   */
  hasOfficialSource: boolean;
  /**
   * Something official backs the affair, whether a `Source` row or a linked
   * `CourtDecision`. The two are not the same thing, and conflating them was
   * understating the corpus: a level A affair holds an identified decision but
   * may carry no official Source row, so it counted as "unsourced".
   */
  hasOfficialEvidence: boolean;
  independentCount: number;
  /** Sources écartées du compte parce qu'elles reprennent le même titre. */
  duplicateReprints: number;
  contradictions: string[];
}

export function assess(affair: {
  status: AffairStatus;
  involvement: Involvement;
  verdictDate: Date | null;
  description: string | null;
  prisonMonths: number | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
  sources: SourceRow[];
  decisionCount: number;
}): Assessment {
  const hasOfficialSource = affair.sources.some(
    (s) =>
      s.sourceType === "JUDILIBRE" ||
      s.sourceType === "LEGIFRANCE" ||
      OFFICIAL_PUBLISHER.test(s.publisher) ||
      OFFICIAL_HOSTS.some((h) => hostOf(s.url) === h || hostOf(s.url).endsWith("." + h))
  );

  // Indépendance : éditeurs distincts, hors encyclopédies, et une seule fois par
  // titre normalisé (une dépêche reprise ne vaut pas deux attestations).
  const seenPublishers = new Set<string>();
  const seenTitles = new Set<string>();
  let independentCount = 0;
  let duplicateReprints = 0;
  for (const s of affair.sources) {
    if (NOT_INDEPENDENT_TYPES.has(s.sourceType)) continue;
    const publisher = s.publisher.trim().toLowerCase();
    const title = normaliseTitle(s.title);
    if (seenPublishers.has(publisher)) continue;
    if (title && seenTitles.has(title)) {
      duplicateReprints++;
      continue;
    }
    seenPublishers.add(publisher);
    if (title) seenTitles.add(title);
    independentCount++;
  }

  const contradictions: string[] = [];
  if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement)) {
    contradictions.push(`statut de condamnation avec implication ${affair.involvement}`);
  }
  if (!affair.verdictDate) {
    contradictions.push("statut de condamnation sans date de verdict");
  } else if (affair.verdictDate.getTime() > Date.now()) {
    contradictions.push("date de verdict dans le futur");
  } else {
    const latest = affair.sources.reduce<number>(
      (max, s) => Math.max(max, s.publishedAt.getTime()),
      0
    );
    if (latest > 0 && latest < affair.verdictDate.getTime()) {
      contradictions.push("toutes les sources précèdent la date du verdict");
    }
  }

  const description = affair.description ?? "";
  if (affair.status === "CONDAMNATION_DEFINITIVE" && describesPendingRecourse(description)) {
    contradictions.push("statut définitif mais la description décrit un recours pendant");
  }
  if (affair.status !== "CONDAMNATION_DEFINITIVE" && RECOURSE_EXHAUSTED.test(description)) {
    contradictions.push(
      "statut non définitif mais la description dit les voies de recours épuisées"
    );
  }

  let level: EvidenceLevel;
  if (contradictions.length > 0) level = "D";
  else if (affair.decisionCount > 0) level = "A";
  else if (hasOfficialSource) level = "B";
  else if (independentCount >= 2) level = "C";
  else level = "D";

  return {
    level,
    hasOfficialSource,
    hasOfficialEvidence: hasOfficialSource || affair.decisionCount > 0,
    independentCount,
    duplicateReprints,
    contradictions,
  };
}

/** Peine chiffrée renseignée, donc vérifiable et à vérifier. */
export function hasPreciseSentence(a: {
  prisonMonths: number | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
}): boolean {
  return Boolean(
    (a.prisonMonths ?? 0) > 0 ||
    (a.fineAmount != null && Number(a.fineAmount) > 0) ||
    (a.ineligibilityMonths ?? 0) > 0
  );
}
