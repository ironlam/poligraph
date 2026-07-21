import { tokenize } from "./text";

export interface ParsedDossier {
  externalId: string;
  titre: string;
  titreChemin?: string;
  senatChemin?: string;
  reunionRefs: string[];
  voteRefs: string[];
}

export interface ResolverMaps {
  reunionToDossiers: Map<string, string[]>;
  voteRefToDossiers: Map<string, Set<string>>;
  dossierAliases: Map<string, Set<string>[]>;
}

/** A slug like "contre_fraudes_aides" tokenized by splitting on "_". */
function slugTokens(slug: string | undefined): Set<string> {
  return slug ? tokenize(slug.replace(/_/g, " ")) : new Set<string>();
}

export function buildDossierMaps(dossiers: ParsedDossier[]): ResolverMaps {
  const reunionToDossiers = new Map<string, string[]>();
  const voteRefToDossiers = new Map<string, Set<string>>();
  const dossierAliases = new Map<string, Set<string>[]>();

  for (const d of dossiers) {
    for (const r of d.reunionRefs) {
      const arr = reunionToDossiers.get(r) ?? [];
      if (!arr.includes(d.externalId)) arr.push(d.externalId);
      reunionToDossiers.set(r, arr);
    }
    for (const v of d.voteRefs) {
      const set = voteRefToDossiers.get(v) ?? new Set<string>();
      set.add(d.externalId);
      voteRefToDossiers.set(v, set);
    }
    const aliases = [
      tokenize(d.titre),
      slugTokens(d.titreChemin),
      slugTokens(d.senatChemin),
    ].filter((s) => s.size > 0);
    dossierAliases.set(d.externalId, aliases);
  }
  return { reunionToDossiers, voteRefToDossiers, dossierAliases };
}

interface ANActe {
  codeActe?: string;
  reunionRef?: string | null;
  voteRefs?: unknown;
  actesLegislatifs?: { acteLegislatif: ANActe | ANActe[] } | null;
}

function walk(
  node: ANActe | ANActe[] | undefined | null,
  reunions: Set<string>,
  votes: Set<string>
): void {
  if (!node) return;
  const nodes = Array.isArray(node) ? node : [node];
  for (const a of nodes) {
    if (a.reunionRef) reunions.add(a.reunionRef);
    if (a.voteRefs) {
      for (const m of JSON.stringify(a.voteRefs).match(/VTANR5L17V\d+/g) ?? []) votes.add(m);
    }
    if (a.actesLegislatifs?.acteLegislatif)
      walk(a.actesLegislatifs.acteLegislatif, reunions, votes);
  }
}

export function parseDossierJson(raw: unknown): ParsedDossier | null {
  const dp = (raw as { dossierParlementaire?: Record<string, unknown> })?.dossierParlementaire;
  if (!dp || typeof dp.uid !== "string") return null;
  const titreDossier = (dp.titreDossier ?? {}) as {
    titre?: string;
    titreChemin?: string;
    senatChemin?: string;
  };
  const reunions = new Set<string>();
  const votes = new Set<string>();
  walk(
    (dp.actesLegislatifs as { acteLegislatif: ANActe | ANActe[] } | undefined)?.acteLegislatif,
    reunions,
    votes
  );
  return {
    externalId: dp.uid,
    titre: titreDossier.titre ?? "",
    titreChemin: titreDossier.titreChemin,
    senatChemin: titreDossier.senatChemin,
    reunionRefs: [...reunions],
    voteRefs: [...votes],
  };
}
