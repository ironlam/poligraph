import { z } from "zod";
import { classifyDossierOrigin } from "@/lib/legislation/origine";
import { getGovernmentScopeExclusion, getWholeBillKind } from "@/lib/scrutins/government-scope";
import { parseOfficialGroupCountsDetailed } from "@/lib/scrutins/official-group-counts";
import { buildDossierMaps, parseDossierJson } from "@/services/sync/reconcile-scrutin-dossier/maps";
import { resolveScrutinDossier } from "@/services/sync/reconcile-scrutin-dossier/resolve";

const scrutinSchema = z.object({
  scrutin: z.object({
    uid: z.string().regex(/^VTANR5L17V[0-9]+$/),
    numero: z.string().regex(/^[0-9]+$/),
    legislature: z.literal("17"),
    titre: z.string().min(1),
    dateScrutin: z.iso.date(),
    seanceRef: z.string().nullable().optional(),
    objet: z
      .object({
        dossierLegislatif: z
          .object({
            dossierRef: z.string().min(1),
          })
          .nullable()
          .optional(),
      })
      .optional(),
    typeVote: z.object({ codeTypeVote: z.string().optional() }).optional(),
    syntheseVote: z
      .object({
        decompte: z.object({
          pour: z.string().regex(/^[0-9]+$/),
          contre: z.string().regex(/^[0-9]+$/),
          abstentions: z.string().regex(/^[0-9]+$/),
        }),
      })
      .optional(),
  }),
});

/** Reproducible comparison of source populations, not the PR2 support indicator. */
export function auditGovernmentSupport(rawScrutins: unknown[], rawDossiers: unknown[]) {
  const dossiers = rawDossiers.map((raw) => {
    const parsed = parseDossierJson(raw);
    if (!parsed) throw new Error("Dossier officiel sans identifiant");
    return { ...parsed, origin: classifyDossierOrigin(raw) };
  });
  const byId = new Map(dossiers.map((dossier) => [dossier.externalId, dossier]));
  if (byId.size !== dossiers.length)
    throw new Error("Identifiant dossier dupliqué dans les sources");
  const maps = buildDossierMaps(dossiers);
  const seen = new Set<string>();
  const rows = rawScrutins
    .map((raw) => {
      const { scrutin: s } = scrutinSchema.parse(raw);
      if (seen.has(s.uid)) throw new Error(`Scrutin dupliqué : ${s.uid}`);
      seen.add(s.uid);
      const resolvedLink = resolveScrutinDossier(
        { uid: s.uid, seanceRef: s.seanceRef ?? null, title: s.titre },
        maps
      );
      const officialDossierRef = s.objet?.dossierLegislatif?.dossierRef?.trim() ?? null;
      const link = officialDossierRef
        ? {
            resolvedDossierExternalId: byId.has(officialDossierRef) ? officialDossierRef : null,
            resolution: "OFFICIAL_DOSSIER_REF",
            candidateExternalIds: [officialDossierRef],
          }
        : resolvedLink;
      const dossier = byId.get(link.resolvedDossierExternalId ?? "");
      const exclusion = getGovernmentScopeExclusion(s.titre, link, dossier?.origin.origin);
      const groups = parseOfficialGroupCountsDetailed(raw);
      const groupConsistencyIssues: string[] = [];
      if (!s.syntheseVote) groupConsistencyIssues.push("GLOBAL_TOTALS_MISSING");
      for (const [source, field] of [
        ["pour", "forCount"],
        ["contre", "againstCount"],
        ["abstentions", "abstainCount"],
      ] as const) {
        if (groups.counts.length === 0 || groups.counts.some((group) => group[field] === null)) {
          groupConsistencyIssues.push(`GROUP_TOTAL_INCOMPLETE:${source}`);
        } else if (
          s.syntheseVote &&
          groups.counts.reduce((total, group) => total + group[field]!, 0) !==
            Number(s.syntheseVote.decompte[source])
        ) {
          groupConsistencyIssues.push(`GROUP_TOTAL_MISMATCH:${source}`);
        }
      }
      const codeTypeVote = s.typeVote?.codeTypeVote ?? null;
      return {
        uid: s.uid,
        number: Number(s.numero),
        date: s.dateScrutin,
        title: s.titre,
        sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/${s.numero}`,
        codeTypeVote,
        wholeBillKind: getWholeBillKind(s.titre),
        // Include partial budget votes and other SPS objects in the review ledger.
        candidate:
          getWholeBillKind(s.titre) === "projet" ||
          codeTypeVote === "SPS" ||
          (/projet de loi/i.test(s.titre) && /ensemble/i.test(s.titre)),
        dossierId: link.resolvedDossierExternalId,
        dossierTitle: dossier?.titre ?? null,
        resolution: link.resolution,
        candidates: link.candidateExternalIds,
        origin: dossier?.origin ?? null,
        exclusion,
        inAll: exclusion === null,
        inSps: exclusion === null && codeTypeVote === "SPS",
        groups,
        groupConsistencyIssues,
      };
    })
    .sort((a, b) => a.number - b.number);
  const frequency = (values: string[]) => {
    const result: Record<string, number> = {};
    for (const value of values) result[value] = (result[value] ?? 0) + 1;
    return result;
  };
  const all = rows.filter((row) => row.inAll);
  const sps = rows.filter((row) => row.inSps);
  const groups = [
    ...new Set(all.flatMap((row) => row.groups.counts.map((group) => group.organeRef))),
  ]
    .filter((ref): ref is string => ref !== null)
    .sort();
  return {
    summary: {
      totalScrutins: rows.length,
      totalDossiers: dossiers.length,
      sourceTypes: frequency(rows.map((row) => row.codeTypeVote ?? "MISSING")),
      wholeGovernmentTitleCandidates: rows.filter((row) => row.wholeBillKind === "projet").length,
      wholeGovernmentTitleCandidatesSps: rows.filter(
        (row) => row.wholeBillKind === "projet" && row.codeTypeVote === "SPS"
      ).length,
      confirmedAll: all.length,
      confirmedSps: sps.length,
      removedBySps: all.length - sps.length,
      confirmedDistinctDossiers: new Set(all.map((row) => row.dossierId)).size,
      confirmedScrutinsWithGroupAnomalies: all.filter(
        (row) =>
          row.groupConsistencyIssues.length > 0 ||
          row.groups.issues.length > 0 ||
          row.groups.counts.some((group) => group.issues.length > 0)
      ).length,
      candidateExclusions: frequency(
        rows.filter((row) => row.candidate && row.exclusion).map((row) => row.exclusion!)
      ),
      wholeProjectExclusions: frequency(
        rows
          .filter((row) => row.wholeBillKind === "projet" && row.exclusion)
          .map((row) => row.exclusion!)
      ),
      groupSourceCoverage: groups.map((organeRef) => {
        const count = (population: typeof rows) =>
          population.filter((row) => {
            const matches = row.groups.counts.filter((group) => group.organeRef === organeRef);
            return (
              matches.length === 1 &&
              matches[0]!.issues.length === 0 &&
              row.groups.issues.length === 0 &&
              row.groupConsistencyIssues.length === 0
            );
          }).length;
        return { organeRef, completeAll: count(all), completeSps: count(sps) };
      }),
    },
    rows,
  };
}
