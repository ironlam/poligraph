/**
 * Import notable French politicians from Wikidata SPARQL.
 *
 * 3 queries:
 * 1. Current regional presidents (P39=Q19546, no P582)
 * 2. Current departmental presidents (P39=Q1805817, no P582)
 * 3. Notable former nationals (deputies/senators/ministers with frwiki article)
 *
 * Deduplication via Q-ID against existing ExternalId records.
 */

import { db } from "@/lib/db";
import { DataSource, MandateType, PublicationStatus } from "@/generated/prisma";
import { HTTPClient } from "@/lib/api/http-client";
import { WIKIDATA_SPARQL_RATE_LIMIT_MS } from "@/config/rate-limits";
import { generateSlug } from "@/lib/utils";
import { upsertPoliticianExternalId } from "@/lib/prisma-helpers";
import { isGovernmentFunctionType } from "./government-sync-guard";
import {
  parseSparqlBindings,
  type SparqlPoliticianBinding,
  type ParsedPolitician,
} from "./wikidata-politicians-parsing";

export type { WikidataPoliticiansSyncResult };

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

// --- Position mapping ---

const POSITION_MAP: Record<string, { type: MandateType; institution: string }> = {
  // Regional/departmental presidents
  Q23090507: { type: MandateType.PRESIDENT_REGION, institution: "Conseil régional" },
  Q23090514: { type: MandateType.PRESIDENT_DEPARTEMENT, institution: "Conseil départemental" },
  Q1872450: { type: MandateType.PRESIDENT_DEPARTEMENT, institution: "Conseil général" },
  // Deputies
  Q3044918: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q21032547: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q18941264: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q55648587: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  Q104728949: { type: MandateType.DEPUTE, institution: "Assemblée nationale" },
  // Senators
  Q3044923: { type: MandateType.SENATEUR, institution: "Sénat" },
  Q18558628: { type: MandateType.SENATEUR, institution: "Sénat" },
  // Government
  Q83307: { type: MandateType.MINISTRE, institution: "Gouvernement" },
  Q191954: { type: MandateType.PRESIDENT_REPUBLIQUE, institution: "Présidence de la République" },
  Q1587677: { type: MandateType.PREMIER_MINISTRE, institution: "Gouvernement" },
};

interface WikidataPoliticiansSyncResult {
  queriedRegional: number;
  queriedDepartmental: number;
  queriedFormerNationals: number;
  alreadyInDb: number;
  created: number;
  mandatesCreated: number;
  errors: string[];
}

// --- SPARQL queries ---

// Wikidata uses region/dept-specific sub-positions (P279) of the generic ones.
// Step 1: fetch all sub-positions, Step 2: use explicit VALUES (avoids P279* timeout).
const QUERY_SUB_POSITIONS = (baseQids: string[]) => `
SELECT ?position WHERE {
  VALUES ?basePos { ${baseQids.map((q) => `wd:${q}`).join(" ")} }
  ?position wdt:P279 ?basePos .
}`;

// Regional: Q23090507 = "président de région en France"
const REGIONAL_BASE_QIDS = ["Q23090507"];

// Departmental: Q23090514 (post-2015) + Q1872450 (pre-2015 "conseil général")
const DEPARTMENTAL_BASE_QIDS = ["Q23090514", "Q1872450"];

function buildCurrentPresidentsQuery(positionQids: string[]) {
  const values = positionQids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?person ?personLabel ?position ?startDate ?birthDate ?gender WHERE {
  VALUES ?position { ${values} }
  ?person p:P39 ?stmt .
  ?stmt ps:P39 ?position .
  FILTER NOT EXISTS { ?stmt pq:P582 ?endDate }
  ?person wdt:P27 wd:Q142 .
  OPTIONAL { ?stmt pq:P580 ?startDate }
  OPTIONAL { ?person wdt:P569 ?birthDate }
  OPTIONAL { ?person wdt:P21 ?gender }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" }
}`;
}

const QUERY_FORMER_NATIONALS = `
SELECT ?person ?personLabel ?position ?startDate ?endDate ?birthDate ?gender WHERE {
  VALUES ?pos { wd:Q3044918 wd:Q21032547 wd:Q18941264 wd:Q55648587 wd:Q104728949
                wd:Q3044923 wd:Q18558628
                wd:Q83307 wd:Q191954 wd:Q1587677 }
  ?person p:P39 ?stmt .
  ?stmt ps:P39 ?pos .
  BIND(?pos AS ?position)
  ?stmt pq:P582 ?endDate .
  ?person wdt:P27 wd:Q142 .
  ?article schema:about ?person ; schema:isPartOf <https://fr.wikipedia.org/> .
  OPTIONAL { ?stmt pq:P580 ?startDate }
  OPTIONAL { ?person wdt:P569 ?birthDate }
  OPTIONAL { ?person wdt:P21 ?gender }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" }
}`;

// --- SPARQL executor ---

interface SparqlSimpleBinding {
  position: { value: string };
}

async function fetchSubPositionQids(client: HTTPClient, baseQids: string[]): Promise<string[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(QUERY_SUB_POSITIONS(baseQids))}&format=json`;
  const { data } = await client.get<{
    results?: { bindings: SparqlSimpleBinding[] };
  }>(url);
  const subQids = (data.results?.bindings ?? []).map((b) =>
    b.position.value.replace("http://www.wikidata.org/entity/", "")
  );
  return [...baseQids, ...subQids];
}

async function runSparql(client: HTTPClient, query: string): Promise<SparqlPoliticianBinding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const { data } = await client.get<{
    results?: { bindings: SparqlPoliticianBinding[] };
  }>(url);
  return data.results?.bindings ?? [];
}

// --- Merge candidates from multiple queries ---

function mergeCandidates(lists: ParsedPolitician[][]): ParsedPolitician[] {
  const allByQid = new Map<string, ParsedPolitician>();
  for (const list of lists) {
    for (const p of list) {
      if (allByQid.has(p.wikidataId)) {
        const existing = allByQid.get(p.wikidataId)!;
        for (const m of p.mandates) {
          const isDupe = existing.mandates.some(
            (em) =>
              em.positionQid === m.positionQid && em.startDate?.getTime() === m.startDate?.getTime()
          );
          if (!isDupe) existing.mandates.push(m);
        }
      } else {
        allByQid.set(p.wikidataId, p);
      }
    }
  }
  return Array.from(allByQid.values());
}

// --- Main sync function ---

export async function syncWikidataPoliticians(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<WikidataPoliticiansSyncResult> {
  const { dryRun = false, limit } = options ?? {};

  const client = new HTTPClient({
    rateLimitMs: WIKIDATA_SPARQL_RATE_LIMIT_MS,
    sourceName: "Wikidata SPARQL",
  });

  const stats: WikidataPoliticiansSyncResult = {
    queriedRegional: 0,
    queriedDepartmental: 0,
    queriedFormerNationals: 0,
    alreadyInDb: 0,
    created: 0,
    mandatesCreated: 0,
    errors: [],
  };

  try {
    // Phase 1a: Discover sub-position Q-IDs for regional/departmental
    console.log("Discovering regional sub-positions...");
    const regionalQids = await fetchSubPositionQids(client, REGIONAL_BASE_QIDS);
    console.log(`  Found ${regionalQids.length} position Q-IDs for regional`);

    console.log("Discovering departmental sub-positions...");
    const deptQids = await fetchSubPositionQids(client, DEPARTMENTAL_BASE_QIDS);
    console.log(`  Found ${deptQids.length} position Q-IDs for departmental`);

    // Build dynamic POSITION_MAP for sub-positions
    for (const qid of regionalQids) {
      if (!POSITION_MAP[qid]) {
        POSITION_MAP[qid] = { type: MandateType.PRESIDENT_REGION, institution: "Conseil régional" };
      }
    }
    for (const qid of deptQids) {
      if (!POSITION_MAP[qid]) {
        POSITION_MAP[qid] = {
          type: MandateType.PRESIDENT_DEPARTEMENT,
          institution: "Conseil départemental",
        };
      }
    }

    // Phase 1b: Run SPARQL queries
    console.log("Querying Wikidata for regional presidents...");
    const regionalBindings = await runSparql(client, buildCurrentPresidentsQuery(regionalQids));
    const regional = parseSparqlBindings(regionalBindings);
    stats.queriedRegional = regional.length;
    console.log(`  Found ${regional.length} regional presidents`);

    console.log("Querying Wikidata for departmental presidents...");
    const deptBindings = await runSparql(client, buildCurrentPresidentsQuery(deptQids));
    const departmental = parseSparqlBindings(deptBindings);
    stats.queriedDepartmental = departmental.length;
    console.log(`  Found ${departmental.length} departmental presidents`);

    console.log("Querying Wikidata for notable former nationals...");
    const formerBindings = await runSparql(client, QUERY_FORMER_NATIONALS);
    const formerNationals = parseSparqlBindings(formerBindings);
    stats.queriedFormerNationals = formerNationals.length;
    console.log(`  Found ${formerNationals.length} notable former nationals`);

    let candidates = mergeCandidates([regional, departmental, formerNationals]);
    console.log(`\nTotal unique candidates: ${candidates.length}`);

    // Phase 2: Filter out Q-IDs already in DB
    const candidateQids = candidates.map((c) => c.wikidataId);
    const existingQids = await db.externalId.findMany({
      where: {
        source: DataSource.WIKIDATA,
        externalId: { in: candidateQids },
      },
      select: { externalId: true },
    });
    const existingSet = new Set(existingQids.map((e) => e.externalId));
    stats.alreadyInDb = existingSet.size;
    candidates = candidates.filter((c) => !existingSet.has(c.wikidataId));
    console.log(`Already in DB: ${existingSet.size}, new: ${candidates.length}`);

    if (limit && candidates.length > limit) {
      candidates = candidates.slice(0, limit);
      console.log(`Limited to ${limit} candidates`);
    }

    if (dryRun) {
      console.log("\n[DRY-RUN] Would create:");
      for (const c of candidates.slice(0, 20)) {
        const mandateTypes = c.mandates
          .map((m) => POSITION_MAP[m.positionQid]?.type ?? m.positionQid)
          .join(", ");
        console.log(`  ${c.firstName} ${c.lastName} (${c.wikidataId}) - ${mandateTypes}`);
      }
      if (candidates.length > 20) {
        console.log(`  ... and ${candidates.length - 20} more`);
      }
      stats.created = candidates.length;
      return stats;
    }

    // Phase 3: Create politicians
    for (const candidate of candidates) {
      try {
        const fullName = `${candidate.firstName} ${candidate.lastName}`.trim();
        let slug = generateSlug(fullName);

        const existingSlug = await db.politician.findUnique({ where: { slug } });
        if (existingSlug) {
          slug = `${slug}-${candidate.wikidataId.toLowerCase()}`;
        }

        const politician = await db.politician.create({
          data: {
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            fullName,
            slug,
            civility: candidate.civility,
            birthDate: candidate.birthDate,
            publicationStatus: PublicationStatus.DRAFT,
          },
        });

        await upsertPoliticianExternalId(
          politician.id,
          DataSource.WIKIDATA,
          candidate.wikidataId,
          `https://www.wikidata.org/wiki/${candidate.wikidataId}`
        );

        for (const m of candidate.mandates) {
          const mapping = POSITION_MAP[m.positionQid];
          if (!mapping) continue;

          // Exclusion permanente : les fonctions gouvernementales relèvent du workflow par actes
          if (isGovernmentFunctionType(mapping.type)) {
            console.log(`  Gel gouvernement : ${candidate.wikidataId} ${mapping.type} ignoré`);
            continue;
          }

          await db.mandate.create({
            data: {
              politicianId: politician.id,
              type: mapping.type,
              title: mapping.type.replace(/_/g, " ").toLowerCase(),
              institution: mapping.institution,
              startDate: m.startDate ?? new Date(),
              endDate: m.endDate,
              isCurrent: m.isCurrent,
              source: DataSource.WIKIDATA,
            },
          });
          stats.mandatesCreated++;
        }

        stats.created++;

        if (stats.created % 50 === 0) {
          console.log(`  Progress: ${stats.created}/${candidates.length}`);
        }
      } catch (error) {
        stats.errors.push(
          `${candidate.wikidataId} (${candidate.firstName} ${candidate.lastName}): ${error}`
        );
      }
    }
  } catch (error) {
    stats.errors.push(`Fatal: ${error}`);
  }

  return stats;
}

// --- Stats function ---

export async function getWikidataPoliticiansStats() {
  const [total, withWikidata, draftCount, regionPresidents, deptPresidents] = await Promise.all([
    db.politician.count(),
    db.externalId.count({ where: { source: DataSource.WIKIDATA, politicianId: { not: null } } }),
    db.politician.count({ where: { publicationStatus: PublicationStatus.DRAFT } }),
    db.mandate.count({ where: { type: MandateType.PRESIDENT_REGION, isCurrent: true } }),
    db.mandate.count({ where: { type: MandateType.PRESIDENT_DEPARTEMENT, isCurrent: true } }),
  ]);

  return { total, withWikidata, draftCount, regionPresidents, deptPresidents };
}
