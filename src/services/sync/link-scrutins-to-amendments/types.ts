import type { ScrutinAmendmentRole } from "@/generated/prisma";

/** Output of the pure title parser. */
export interface ParsedTitle {
  principalNumbers: string[];
  subAmendmentNumber: string | null;
  parentAmendmentNumber: string | null;
  hasIdentique: boolean;
  identiqueNumbers: string[];
  /**
   * Délibération the vote belongs to, read from the title:
   *   2   -> "seconde délibération"
   *   1   -> "première délibération"
   *   null -> unspecified (an ordinary première-délibération vote)
   * Used to disambiguate a (dossier, number) match when the same amendment
   * number exists in both the first and the second délibération.
   */
  deliberation: 1 | 2 | null;
  warnings: ParserWarning[];
  confidence: number;
}

export interface ParserWarning {
  code: string;
  message: string;
}

export interface LinkResolution {
  scrutinId: string;
  links: ResolvedLink[];
  warnings: ParserWarning[];
  parserConfidence: number;
  /** V1 emits only "dossier" or "unscoped". "dossier-fallback-texteRef" reserved for V1.5. */
  scope: "dossier" | "dossier-fallback-texteRef" | "unscoped";
}

export interface ResolvedLink {
  scrutinId: string;
  amendmentId: string;
  role: ScrutinAmendmentRole;
  parserConfidence: number;
  parserWarnings: ParserWarning[];
}

export interface LinkScrutinsOptions {
  scrutinIds?: string[];
  legislature?: number;
  chamber?: "AN" | "SENAT";
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface LinkScrutinsStats {
  scrutinsScanned: number;
  scrutinsWithAmendmentLookingTitle: number;
  scrutinsWithDossierScope: number;
  scrutinsLinked: number;
  scrutinsUnscoped: number;
  scrutinsAmbiguous: number;
  scrutinsCandidateNotFound: number;
  scrutinsUnresolved: number;
  scrutinsNoAmendmentCited: number;
  linksCreated: number;
  linksSkippedDuplicate: number;
  byRole: Record<ScrutinAmendmentRole, number>;
  warnings: { scrutinId: string; code: string; message: string }[];
  durationMs: number;
}
