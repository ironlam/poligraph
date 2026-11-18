import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { DataSource, Judgement, PublicationStatus, type Prisma } from "@/generated/prisma";
import { HTTPClient } from "@/lib/api/http-client";
import { DATA_GOUV_RATE_LIMIT_MS } from "@/config/rate-limits";
import { resolveBatch, type ResolveResult } from "@/lib/identity";
import { requestProfileRefresh } from "@/lib/politicians/profile-snapshot/request";
import { registerDateFromUrl } from "./conseils";
import {
  RNE_CONSEILLERS_DEPARTEMENTAUX_FRAGMENTS,
  RNE_CONSEILLERS_REGIONAUX_FRAGMENTS,
  resolveRneResourceUrl,
} from "./rne-resource";
import {
  buildExecutifIdentity,
  buildExecutifMandate,
  classifyExecutif,
  executifSourceId,
  parsePresidentRows,
  registreDepasse,
  type ExecutifMandateData,
  type ExecutifNiveau,
  type ExecutifVerdict,
  type PresidentRow,
} from "./executifs-plan";

/**
 * Links the presidents of departmental and regional councils listed by the RNE to their
 * `Politician` (D22), by writing the executive mandate the Territoires pages already read.
 * A president with no candidate profile at all (SANS_FICHE) gets one, built from the register
 * line only. Re-runnable: a line already decided or already linked is left as is. Conseillers
 * are never linked. A mandate whose holder left the register is not closed here.
 */

const DECIDED_BY = "system:sync-executifs";
const client = new HTTPClient({ rateLimitMs: DATA_GOUV_RATE_LIMIT_MS });

export interface ExecutifLine {
  niveau: ExecutifNiveau;
  territoryCode: string;
  name: string;
  verdict: ExecutifVerdict;
  slug: string | null;
  action: string;
}

export interface ExecutifsReport {
  dryRun: boolean;
  lines: ExecutifLine[];
  mandatesCreated: number;
  politiciansCreated: number;
  decisionsWritten: number;
}

export interface LoadedRow extends PresidentRow {
  sourceUrl: string;
}

function currentHolders(mandate: ExecutifMandateData) {
  return db.mandate.findMany({
    where: {
      type: mandate.type,
      isCurrent: true,
      OR: [
        { constituency: mandate.constituency },
        ...(mandate.departmentCode ? [{ departmentCode: mandate.departmentCode }] : []),
      ],
    },
    select: { politicianId: true },
  });
}

/**
 * Public profile for a president, from the register line only. Called by the sync for a
 * SANS_FICHE line, and by hand once a reviewer has ruled out every homonym.
 */
export async function createExecutifPolitician(
  row: LoadedRow,
  mandate: ExecutifMandateData,
  registerAt: Date | null
): Promise<{ id: string; slug: string }> {
  const taken = await db.politician.findUnique({
    where: { slug: buildExecutifIdentity(row, false).slug },
    select: { id: true },
  });
  return db.politician.create({
    data: {
      ...buildExecutifIdentity(row, taken !== null),
      source: DataSource.RNE,
      publicationStatus: PublicationStatus.PUBLISHED,
      mandates: {
        create: {
          ...mandate,
          isCurrent: true,
          source: DataSource.RNE,
          externalId: executifSourceId(row),
          sourceUrl: row.sourceUrl,
          lastConfirmedAt: registerAt,
        },
      },
    },
    select: { id: true, slug: true },
  });
}

export async function loadPresidents(niveau: ExecutifNiveau): Promise<LoadedRow[]> {
  const sourceUrl = await resolveRneResourceUrl(
    niveau === "DEPARTEMENTAL"
      ? RNE_CONSEILLERS_DEPARTEMENTAUX_FRAGMENTS
      : RNE_CONSEILLERS_REGIONAUX_FRAGMENTS
  );
  const { data } = await client.getText(sourceUrl);
  const records = parse(data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: ";",
    bom: true,
  }) as Record<string, string>[];
  return parsePresidentRows(niveau, records).map((row) => ({ ...row, sourceUrl }));
}

function decisionEvidence(row: LoadedRow, result: ResolveResult): Prisma.InputJsonValue {
  const best = result.candidates.find((c) => c.politicianId === result.politicianId);
  return {
    version: 3,
    rule: "executif: SAME + prénom exact + date de naissance",
    niveau: row.niveau,
    territoryCode: row.territoryCode,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate?.toISOString() ?? null,
    resolverDecision: String(result.decision),
    fellegiSunter: best?.fellegiSunter ?? null,
  };
}

export async function syncExecutifs(options: { dryRun?: boolean } = {}): Promise<ExecutifsReport> {
  const dryRun = options.dryRun ?? true;
  const rows = [...(await loadPresidents("DEPARTEMENTAL")), ...(await loadPresidents("REGIONAL"))];
  const sourceIds = rows.map(executifSourceId);

  // persist: false, the decisions worth keeping are written below under this service's rule.
  const { results } = await resolveBatch({
    sourceType: DataSource.RNE,
    persist: false,
    inputs: rows.map((row, i) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      birthDate: row.birthDate,
      gender: row.gender,
      department:
        row.niveau === "DEPARTEMENTAL" ? row.territoryCode : (row.subdivisionCode ?? undefined),
      source: DataSource.RNE,
      sourceId: sourceIds[i]!,
    })),
  });
  const resultBySource = new Map(results.map((r) => [r.sourceId, r]));

  const politicianIds = [...new Set(results.flatMap((r) => r.politicianId ?? []))];
  const [politicians, decisions] = await Promise.all([
    db.politician.findMany({
      where: { id: { in: politicianIds } },
      select: {
        id: true,
        slug: true,
        publicationStatus: true,
        mandates: {
          where: { isCurrent: true, type: { in: ["DEPUTE", "SENATEUR", "DEPUTE_EUROPEEN"] } },
          select: { startDate: true },
        },
      },
    }),
    db.identityDecision.findMany({
      where: { sourceType: DataSource.RNE, sourceId: { in: sourceIds }, supersededBy: null },
      select: { sourceId: true, politicianId: true },
    }),
  ]);
  const politicianById = new Map(politicians.map((p) => [p.id, p]));
  const decided = new Set(decisions.map((d) => `${d.sourceId}|${d.politicianId}`));

  const report: ExecutifsReport = {
    dryRun,
    lines: [],
    mandatesCreated: 0,
    politiciansCreated: 0,
    decisionsWritten: 0,
  };
  const refreshed: string[] = [];

  for (const [i, row] of rows.entries()) {
    const sourceId = sourceIds[i]!;
    const result = resultBySource.get(sourceId);
    const verdict = classifyExecutif(result);
    const politician = result?.politicianId ? politicianById.get(result.politicianId) : undefined;
    const line: ExecutifLine = {
      niveau: row.niveau,
      territoryCode: row.territoryCode,
      name: `${row.firstName} ${row.lastName}`,
      verdict,
      slug: politician?.slug ?? null,
      action: "aucune",
    };
    report.lines.push(line);
    const registerDate = registerDateFromUrl(row.sourceUrl);
    const registerAt = registerDate ? new Date(`${registerDate}T12:00:00Z`) : null;

    if (verdict === "SANS_FICHE") {
      const mandate = buildExecutifMandate(row);
      if (!mandate) {
        line.action = "territoire hors référentiel ou date de début absente";
        continue;
      }
      if ((await currentHolders(mandate)).length > 0) {
        line.action = "conflit : un autre titulaire a ce mandat";
        continue;
      }
      line.action = "fiche créée";
      report.politiciansCreated++;
      if (dryRun) continue;
      // No candidate shares this family name: nothing to mistake it for, so it is public at
      // once, like a mayor created by the RNE sync.
      const created = await createExecutifPolitician(row, mandate, registerAt);
      line.slug = created.slug;
      refreshed.push(created.id);
      continue;
    }
    if (!result || !politician || verdict === "HOMONYME") continue;

    if (!decided.has(`${sourceId}|${politician.id}`)) {
      report.decisionsWritten++;
      if (!dryRun) {
        await db.identityDecision.create({
          data: {
            sourceType: DataSource.RNE,
            sourceId,
            politicianId: politician.id,
            judgement: verdict === "LINK" ? Judgement.SAME : Judgement.UNDECIDED,
            confidence: result.confidence,
            method: result.method,
            evidence: decisionEvidence(row, result),
            decidedBy: DECIDED_BY,
          },
        });
      }
    }
    if (verdict === "REVIEW") {
      line.action = "revue humaine";
      continue;
    }
    if (politician.publicationStatus !== "PUBLISHED") {
      line.action = "fiche non publique, pas de mandat";
      continue;
    }
    if (
      registreDepasse(
        registerAt,
        politician.mandates.map((m) => m.startDate)
      )
    ) {
      line.action = "à vérifier : mandat parlementaire commencé après la date du registre";
      continue;
    }
    const mandate = buildExecutifMandate(row);
    if (!mandate) {
      line.action = "territoire hors référentiel ou date de début absente";
      continue;
    }

    const holders = await currentHolders(mandate);
    if (holders.length > 0) {
      line.action = holders.some((h) => h.politicianId === politician.id)
        ? "déjà relié"
        : "conflit : un autre titulaire a ce mandat";
      continue;
    }

    line.action = "mandat créé";
    report.mandatesCreated++;
    if (dryRun) continue;
    await db.mandate.create({
      data: {
        ...mandate,
        politicianId: politician.id,
        isCurrent: true,
        source: DataSource.RNE,
        externalId: sourceId,
        sourceUrl: row.sourceUrl,
        lastConfirmedAt: registerAt,
      },
    });
    refreshed.push(politician.id);
  }

  if (refreshed.length > 0) {
    await requestProfileRefresh({ politicianIds: refreshed }, "sync-executifs");
  }
  return report;
}
