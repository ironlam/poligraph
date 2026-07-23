/**
 * Reconcile MAIRE mandates against the March 2026 municipal results.
 *
 * The 2026 results were ingested into `Candidacy` but never propagated to
 * `Mandate`: ~34.7k pre-2026 RNE mayor mandates are still `isCurrent`, many of
 * them for someone who is no longer mayor. This tool detects and (with --apply)
 * corrects that.
 *
 * Usage:
 *   npx tsx scripts/reconcile-municipales-2026-mayors.ts            # dry-run, writes CSV
 *   npx tsx scripts/reconcile-municipales-2026-mayors.ts --apply-phase1   # close obsolete (b1) mandates
 *   npx tsx scripts/reconcile-municipales-2026-mayors.ts --apply-phase2   # link re-elected winners
 *   npx tsx scripts/reconcile-municipales-2026-mayors.ts --apply-phase3   # create/publish new mayors (>=1000, b1)
 *
 * Dry-run is the default and never writes to the DB.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { DataSource, Judgement, MandateType, PublicationStatus } from "@/generated/prisma";
import { resolveBatch } from "@/lib/identity";
import type { ResolveInput } from "@/lib/identity";
import { generateSlug } from "@/lib/utils";
import { normalizeText } from "@/lib/name-matching";
import { norm, nameMatchesWinner } from "./lib/mayor-name-match";

const MUNI_2026 = "cmlfp53ir0000iuv5pqgk82cj";
const INSTALL_DATE = new Date("2026-03-26");
const APPLY_PHASE1 = process.argv.includes("--apply-phase1");
const APPLY_PHASE2 = process.argv.includes("--apply-phase2");
const APPLY_PHASE3 = process.argv.includes("--apply-phase3");
// Phase 3 population floor (staged rollout): --phase3-min-pop=20000 first, then lower.
const PHASE3_MIN_POP = (() => {
  const a = process.argv.find((x) => x.startsWith("--phase3-min-pop="));
  const n = a ? parseInt(a.split("=")[1] ?? "", 10) : 1000;
  return Number.isNaN(n) ? 1000 : n;
})();
const CSV_PATH =
  process.env.RECONCILE_CSV ||
  "/tmp/claude-1000/-home-ldiaby-projects-politic-tracker/57b8d3c3-515c-4007-937d-fd27320f7407/scratchpad/mayors-reconcile.csv";

function tokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(" ")
      .filter((t) => t.length >= 3)
  );
}
function band(pop: number | null | undefined): string {
  if (pop == null) return "pop inconnue";
  if (pop >= 20000) return ">=20000";
  if (pop >= 3500) return "3500-20000";
  if (pop >= 1000) return "1000-3500";
  return "<1000";
}

// Token overlap of a name against the winner's candidateName, reusing the same
// norm/tokens classifier as Phase 1. Returns which of first/last name match.
function nameOverlap(
  firstName: string | null,
  lastName: string,
  winnerName: string
): { first: boolean; last: boolean } {
  const wt = tokens(winnerName);
  const last = norm(lastName)
    .split(" ")
    .filter((t) => t.length >= 3)
    .some((t) => wt.has(t));
  const first = norm(firstName || "")
    .split(" ")
    .filter((t) => t.length >= 3)
    .some((t) => wt.has(t));
  return { first, last };
}

// INSEE code -> department code (3 chars for DOM/COM 97x/98x, else 2).
function deptFromInsee(insee: string): string {
  return insee.startsWith("97") || insee.startsWith("98") ? insee.slice(0, 3) : insee.slice(0, 2);
}

interface WinnerInfo {
  candidacyId: string;
  candidateName: string;
  winnerPid: string | null;
  candidateFirst: string | null;
  candidateLast: string | null;
  candidateGender: string | null;
  communeName: string | null;
  population: number | null;
}

interface Linkable {
  communeId: string;
  candidacyId: string;
  mayorPid: string;
  mayorName: string;
  winnerName: string;
}

interface ObsoleteRow {
  communeId: string;
  dept: string;
  bucket: "b1" | "b2";
  winner: WinnerInfo;
}

// Self-contained load of the data the Phase 2/3 functions need. Independent of
// Phase 1 so its already-applied logic stays untouched.
async function loadPhaseData(): Promise<{
  mandates: Array<{
    id: string;
    politicianId: string;
    departmentCode: string | null;
    politician: { firstName: string; lastName: string; fullName: string };
    localData: { communeId: string | null } | null;
  }>;
  byCommune: Map<string, WinnerInfo>;
}> {
  const mandates = await db.mandate.findMany({
    where: { type: "MAIRE", isCurrent: true, source: "RNE", localData: { isNot: null } },
    select: {
      id: true,
      politicianId: true,
      departmentCode: true,
      politician: { select: { firstName: true, lastName: true, fullName: true } },
      localData: { select: { communeId: true } },
    },
  });

  const designates = await db.candidacy.findMany({
    where: { electionId: MUNI_2026, isElected: true, listPosition: 1, communeId: { not: null } },
    select: {
      id: true,
      communeId: true,
      candidateName: true,
      politicianId: true,
      candidate: { select: { firstName: true, lastName: true, gender: true } },
      commune: { select: { name: true, population: true } },
    },
  });

  const byCommune = new Map<string, WinnerInfo>();
  for (const d of designates) {
    if (d.communeId && !byCommune.has(d.communeId)) {
      byCommune.set(d.communeId, {
        candidacyId: d.id,
        candidateName: d.candidateName,
        winnerPid: d.politicianId,
        candidateFirst: d.candidate?.firstName ?? null,
        candidateLast: d.candidate?.lastName ?? null,
        candidateGender: d.candidate?.gender ?? null,
        communeName: d.commune?.name ?? null,
        population: d.commune?.population ?? null,
      });
    }
  }

  return { mandates, byCommune };
}

// Same classification as Phase 1 (pid match / last-name overlap -> re-elected;
// else obsolete, first-name overlap -> b2 else b1), producing the two working
// sets. Deduped by commune.
function buildPhaseClassification(
  mandates: Awaited<ReturnType<typeof loadPhaseData>>["mandates"],
  byCommune: Map<string, WinnerInfo>
): { linkables: Linkable[]; obsolete: ObsoleteRow[] } {
  const linkables: Linkable[] = [];
  const obsolete: ObsoleteRow[] = [];
  const seenLink = new Set<string>();
  const seenObsolete = new Set<string>();

  for (const m of mandates) {
    const communeId = m.localData?.communeId;
    if (!communeId) continue;
    const w = byCommune.get(communeId);
    if (!w) continue;
    if (w.winnerPid && w.winnerPid === m.politicianId) continue; // already linked, same person

    const { first, last } = nameOverlap(
      m.politician.firstName,
      m.politician.lastName,
      w.candidateName
    );

    if (last) {
      // Re-elected by name. Phase 2 targets those the candidacy hasn't linked yet
      // where BOTH first and last name match the sitting mayor.
      if (w.winnerPid === null && first && !seenLink.has(communeId)) {
        seenLink.add(communeId);
        linkables.push({
          communeId,
          candidacyId: w.candidacyId,
          mayorPid: m.politicianId,
          mayorName: m.politician.fullName,
          winnerName: w.candidateName,
        });
      }
      continue;
    }

    const bucket: "b1" | "b2" = first ? "b2" : "b1";
    if (!seenObsolete.has(communeId)) {
      seenObsolete.add(communeId);
      obsolete.push({
        communeId,
        dept: m.departmentCode ?? communeId.slice(0, 2),
        bucket,
        winner: w,
      });
    }
  }

  return { linkables, obsolete };
}

// PHASE 2 — link re-elected winners (candidacy.politicianId is null) to the
// existing politician who currently holds the RNE MAIRE mandate.
async function runPhase2(linkables: Linkable[]) {
  console.log("\n=== PHASE 2 — lier les maires réélus (candidacy.politicianId manquant) ===");
  console.log(
    `Candidatures à lier (réélu, pid null, prénom + nom concordants): ${linkables.length}`
  );
  console.log("Échantillon (15):");
  for (const l of linkables.slice(0, 15)) {
    console.log(`  ${l.communeId}: "${l.winnerName}" -> ${l.mayorName} (${l.mayorPid})`);
  }

  if (APPLY_PHASE2) {
    console.log(`\n>>> APPLY PHASE 2: liaison de ${linkables.length} candidatures ...`);
    let done = 0;
    for (let i = 0; i < linkables.length; i += 200) {
      const chunk = linkables.slice(i, i + 200);
      for (const l of chunk) {
        // Idempotent: only links when still unlinked.
        const res = await db.candidacy.updateMany({
          where: { id: l.candidacyId, politicianId: null },
          data: { politicianId: l.mayorPid },
        });
        done += res.count;
      }
      console.log(`  ...${Math.min(i + 200, linkables.length)}/${linkables.length}`);
    }
    console.log(`Phase 2 terminée: ${done} candidatures liées.`);
  } else {
    console.log("(dry-run — aucune écriture. --apply-phase2 pour lier.)");
  }
}

// Create a fresh DRAFT stub politician for a 2026 winner that has no safe
// existing match, and return its id. Mirrors the original Phase 3 else-branch;
// derives first/last from candidateName when the structured fields are absent
// (so a guard-rejected already-linked winner never yields an empty-name stub).
async function createDraftStub(w: WinnerInfo, insee: string): Promise<string> {
  const parts = (w.candidateName ?? "").trim().split(/\s+/).filter(Boolean);
  const first = w.candidateFirst ?? parts[0] ?? "";
  const last = w.candidateLast ?? parts.slice(1).join(" ");
  const fullName = `${first} ${last}`.trim() || w.candidateName || insee;
  const civility = w.candidateGender === "F" ? "Mme" : w.candidateGender === "M" ? "M." : null;
  const baseSlug = generateSlug(fullName);
  const clash = await db.politician.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  });
  const slug = clash ? `${baseSlug}-${insee}` : baseSlug;
  const created = await db.politician.create({
    data: {
      slug,
      civility,
      firstName: first,
      lastName: last,
      fullName,
      source: DataSource.MUNICIPALES,
      publicationStatus: PublicationStatus.DRAFT,
    },
  });
  return created.id;
}

// PHASE 3 — create/publish new mayors for communes that have a 2026 winner but
// NO current MAIRE mandate (population >= 1000). Anchored on the missing-mandate
// gap, not on Phase 1's classifier, so it is correct regardless of run order
// (Phase 1 already removed the obsolete mandates that used to flag these).
// Dry-run is strictly read-only (no resolveBatch).
async function runPhase3(byCommune: Map<string, WinnerInfo>) {
  console.log(
    `\n=== PHASE 3 — nouveaux maires (communes >=${PHASE3_MIN_POP} hab sans maire actuel) ===`
  );

  const currentMayor = await db.mandate.findMany({
    where: { type: MandateType.MAIRE, isCurrent: true, localData: { isNot: null } },
    select: { localData: { select: { communeId: true } } },
  });
  const hasMayor = new Set<string>();
  for (const m of currentMayor) {
    if (m.localData?.communeId) hasMayor.add(m.localData.communeId);
  }

  const targets: { communeId: string; dept: string; winner: WinnerInfo }[] = [];
  for (const [communeId, winner] of byCommune) {
    if ((winner.population ?? 0) < PHASE3_MIN_POP) continue;
    if (hasMayor.has(communeId)) continue;
    targets.push({ communeId, dept: deptFromInsee(communeId), winner });
  }
  const alreadyLinked = targets.filter((o) => o.winner.winnerPid !== null);
  const needsResolution = targets.filter((o) => o.winner.winnerPid === null);

  // Cheap, APPROXIMATE existing-in-DB estimate (no resolveBatch): a winner is
  // considered "already exists" if a politician with the same normalized
  // first+last name holds any mandate in the same department, OR a MUNICIPALES
  // ExternalId already carries the same "first|last|dept" source id.
  const [pols, extIds] = await Promise.all([
    db.politician.findMany({
      select: {
        firstName: true,
        lastName: true,
        mandates: {
          where: { departmentCode: { not: null } },
          select: { departmentCode: true },
        },
      },
    }),
    db.externalId.findMany({
      where: { source: DataSource.MUNICIPALES },
      select: { externalId: true },
    }),
  ]);
  const polKeySet = new Set<string>();
  for (const p of pols) {
    const nf = normalizeText(p.firstName);
    const nl = normalizeText(p.lastName);
    for (const md of p.mandates) {
      if (md.departmentCode) polKeySet.add(`${nf}|${nl}|${md.departmentCode}`);
    }
  }
  const extIdSet = new Set(extIds.map((e) => e.externalId));

  let approxExisting = 0;
  let approxNew = 0;
  let noCandidateEntity = 0;
  for (const o of needsResolution) {
    const w = o.winner;
    if (!w.candidateFirst || !w.candidateLast) {
      // No Candidate entity to key on -> cannot estimate, counted as likely-new.
      noCandidateEntity++;
      approxNew++;
      continue;
    }
    const normKey = `${normalizeText(w.candidateFirst)}|${normalizeText(w.candidateLast)}|${o.dept}`;
    const rawKey = `${w.candidateFirst}|${w.candidateLast}|${o.dept}`;
    if (polKeySet.has(normKey) || extIdSet.has(rawKey)) approxExisting++;
    else approxNew++;
  }

  console.log(`Communes >=${PHASE3_MIN_POP} hab sans maire actuel:   ${targets.length}`);
  console.log(`  (i)  ALREADY-LINKED (candidacy.politicianId): ${alreadyLinked.length}`);
  console.log(`  (ii) NEEDS-RESOLUTION (pid null):             ${needsResolution.length}`);
  console.log(
    `       ~existant en base (approx):              ${approxExisting}` +
      `  |  ~à créer (approx): ${approxNew}`
  );
  if (noCandidateEntity > 0) {
    console.log(
      `       dont sans entité Candidate (non estimable): ${noCandidateEntity} (comptés en "à créer")`
    );
  }

  console.log("Échantillon (15):");
  for (const o of targets.slice(0, 15)) {
    const cls = o.winner.winnerPid ? "ALREADY-LINKED" : "NEEDS-RESOLUTION";
    console.log(
      `  ${o.dept} ${o.communeId} ${o.winner.communeName ?? ""} (pop ${o.winner.population ?? "?"}): "${o.winner.candidateName}" [${cls}]`
    );
  }

  if (APPLY_PHASE3) {
    console.log(
      `\n>>> APPLY PHASE 3: ${alreadyLinked.length} liés + ${needsResolution.length} à résoudre ...`
    );

    // (i) ALREADY-LINKED: create MAIRE mandate + local (idempotent) and publish,
    // but only after the name guard confirms the pre-existing candidacy link is
    // the same person. A false link (same surname, different first name) is
    // re-pointed to a fresh DRAFT stub instead of publishing the wrong profile.
    let mandCreated = 0;
    let stubsFromLinked = 0;
    for (let i = 0; i < alreadyLinked.length; i += 200) {
      const chunk = alreadyLinked.slice(i, i + 200);
      for (const o of chunk) {
        const w = o.winner;
        const insee = o.communeId;
        const communeName = w.communeName ?? insee;
        const linkedPid = w.winnerPid as string;

        const linkedPol = await db.politician.findUnique({
          where: { id: linkedPid },
          select: { firstName: true, lastName: true },
        });
        const guardOk =
          linkedPol != null &&
          nameMatchesWinner(
            linkedPol.firstName,
            linkedPol.lastName,
            w.candidateFirst,
            w.candidateLast,
            w.candidateName
          );

        let pid: string;
        if (guardOk) {
          pid = linkedPid;
          // pop >= 1000 by construction.
          await db.politician.update({
            where: { id: pid },
            data: { publicationStatus: PublicationStatus.PUBLISHED },
          });
        } else {
          // False link -> fresh DRAFT stub, re-point the candidacy away from the
          // mismatched politician (which is NOT published).
          pid = await createDraftStub(w, insee);
          await db.candidacy.update({
            where: { id: w.candidacyId },
            data: { politicianId: pid },
          });
          stubsFromLinked++;
        }

        const existing = await db.mandate.findFirst({
          where: {
            politicianId: pid,
            type: MandateType.MAIRE,
            isCurrent: true,
            localData: { communeId: insee },
          },
          select: { id: true },
        });
        if (!existing) {
          await db.mandate.create({
            data: {
              politicianId: pid,
              type: MandateType.MAIRE,
              title: `Maire de ${communeName}`,
              institution: communeName,
              constituency: `${communeName} (${insee})`,
              departmentCode: deptFromInsee(insee),
              startDate: INSTALL_DATE,
              isCurrent: true,
              source: DataSource.MUNICIPALES,
              localData: { create: { communeId: insee } },
            },
          });
          mandCreated++;
        }
      }
      console.log(`  linked ...${Math.min(i + 200, alreadyLinked.length)}/${alreadyLinked.length}`);
    }

    // (ii) NEEDS-RESOLUTION: resolveBatch (chunked) -> link SAME or create DRAFT stub.
    const inputMap = new Map<string, ResolveInput>();
    for (const o of needsResolution) {
      const w = o.winner;
      if (!w.candidateFirst || !w.candidateLast) continue;
      const key = `${w.candidateFirst}|${w.candidateLast}|${o.dept}`;
      if (!inputMap.has(key)) {
        inputMap.set(key, {
          firstName: w.candidateFirst,
          lastName: w.candidateLast,
          source: DataSource.MUNICIPALES,
          sourceId: key,
          department: o.dept,
          gender: w.candidateGender ?? undefined,
          mandateType: MandateType.MAIRE,
        });
      }
    }
    const inputs = Array.from(inputMap.values());
    const resolved = new Map<string, { politicianId: string | null; decision: string }>();
    const RESOLVE_CHUNK = 2000;
    for (let i = 0; i < inputs.length; i += RESOLVE_CHUNK) {
      const chunk = inputs.slice(i, i + RESOLVE_CHUNK);
      const res = await resolveBatch({ inputs: chunk, sourceType: DataSource.MUNICIPALES });
      for (const r of res.results) {
        resolved.set(r.sourceId, { politicianId: r.politicianId, decision: r.decision });
      }
      console.log(`  resolve ...${Math.min(i + RESOLVE_CHUNK, inputs.length)}/${inputs.length}`);
    }

    let linked = 0;
    let stubs = 0;
    let guardBlocked = 0;
    for (let i = 0; i < needsResolution.length; i += 200) {
      const chunk = needsResolution.slice(i, i + 200);
      for (const o of chunk) {
        const w = o.winner;
        if (!w.candidateFirst || !w.candidateLast) continue;
        const insee = o.communeId;
        const communeName = w.communeName ?? insee;
        const key = `${w.candidateFirst}|${w.candidateLast}|${o.dept}`;
        const rr = resolved.get(key);

        let pid: string;
        if (rr && rr.decision === Judgement.SAME && rr.politicianId) {
          // Existing politician resolved. Confirm the names actually match before
          // publishing the real profile — the resolver over-matches on
          // surname+department without a birthdate.
          const matchPol = await db.politician.findUnique({
            where: { id: rr.politicianId },
            select: { firstName: true, lastName: true },
          });
          const guardOk =
            matchPol != null &&
            nameMatchesWinner(
              matchPol.firstName,
              matchPol.lastName,
              w.candidateFirst,
              w.candidateLast,
              w.candidateName
            );
          if (guardOk) {
            pid = rr.politicianId;
            linked++;
            await db.politician.update({
              where: { id: pid },
              data: { publicationStatus: PublicationStatus.PUBLISHED },
            });
          } else {
            // False SAME -> fresh DRAFT stub instead of publishing the wrong person.
            pid = await createDraftStub(w, insee);
            stubs++;
            guardBlocked++;
          }
        } else {
          pid = await createDraftStub(w, insee);
          stubs++;
        }

        // Link the candidacy (idempotent) so a re-run sees ALREADY-LINKED.
        await db.candidacy.updateMany({
          where: { id: w.candidacyId, politicianId: null },
          data: { politicianId: pid },
        });

        const existing = await db.mandate.findFirst({
          where: {
            politicianId: pid,
            type: MandateType.MAIRE,
            isCurrent: true,
            localData: { communeId: insee },
          },
          select: { id: true },
        });
        if (!existing) {
          await db.mandate.create({
            data: {
              politicianId: pid,
              type: MandateType.MAIRE,
              title: `Maire de ${communeName}`,
              institution: communeName,
              constituency: `${communeName} (${insee})`,
              departmentCode: deptFromInsee(insee),
              startDate: INSTALL_DATE,
              isCurrent: true,
              source: DataSource.MUNICIPALES,
              localData: { create: { communeId: insee } },
            },
          });
        }
      }
      console.log(
        `  resolved ...${Math.min(i + 200, needsResolution.length)}/${needsResolution.length}`
      );
    }
    console.log(
      `Phase 3 terminée: ${mandCreated} mandats (liés) créés, ${linked} liés via resolveBatch, ` +
        `${stubs} stubs DRAFT créés (dont ${guardBlocked} SAME rejetés par le garde-nom), ` +
        `${stubsFromLinked} liens pré-existants ré-orientés vers un stub.`
    );
  } else {
    console.log("(dry-run — aucune écriture, aucun resolveBatch. --apply-phase3 pour appliquer.)");
  }
}

async function main() {
  const mandates = await db.mandate.findMany({
    where: { type: "MAIRE", isCurrent: true, source: "RNE", localData: { isNot: null } },
    select: {
      id: true,
      politicianId: true,
      departmentCode: true,
      politician: { select: { firstName: true, lastName: true, fullName: true } },
      localData: { select: { communeId: true } },
    },
  });

  const designates = await db.candidacy.findMany({
    where: { electionId: MUNI_2026, isElected: true, listPosition: 1, communeId: { not: null } },
    select: {
      communeId: true,
      candidateName: true,
      politicianId: true,
      commune: { select: { name: true, population: true } },
    },
  });
  const byCommune = new Map<
    string,
    { name: string; pid: string | null; communeName: string | null; population: number | null }
  >();
  for (const d of designates) {
    if (d.communeId && !byCommune.has(d.communeId)) {
      byCommune.set(d.communeId, {
        name: d.candidateName,
        pid: d.politicianId,
        communeName: d.commune?.name ?? null,
        population: d.commune?.population ?? null,
      });
    }
  }

  let reelected = 0;
  let noData = 0;
  const obsolete: {
    mandateId: string;
    commune: string;
    dept: string;
    communeName: string;
    pop: number | null;
    dbMayor: string;
    winner: string;
    bucket: "b1" | "b2";
  }[] = [];
  const bandCount: Record<string, { b1: number; b2: number }> = {};

  for (const m of mandates) {
    const commune = m.localData?.communeId;
    if (!commune) continue;
    const w = byCommune.get(commune);
    if (!w) {
      noData++;
      continue;
    }
    if (w.pid && w.pid === m.politicianId) {
      reelected++;
      continue;
    }
    const wt = tokens(w.name);
    const lastMatch = norm(m.politician.lastName)
      .split(" ")
      .filter((t) => t.length >= 3)
      .some((t) => wt.has(t));
    if (lastMatch) {
      reelected++;
      continue;
    }
    const firstMatch = norm(m.politician.firstName || "")
      .split(" ")
      .filter((t) => t.length >= 3)
      .some((t) => wt.has(t));
    const bucket = firstMatch ? "b2" : "b1";
    obsolete.push({
      mandateId: m.id,
      commune,
      dept: m.departmentCode ?? commune.slice(0, 2),
      communeName: w.communeName ?? "",
      pop: w.population,
      dbMayor: m.politician.fullName,
      winner: w.name,
      bucket,
    });
    const b = band(w.population);
    bandCount[b] = bandCount[b] || { b1: 0, b2: 0 };
    bandCount[b][bucket]++;
  }

  const b1 = obsolete.filter((o) => o.bucket === "b1");
  const b2 = obsolete.filter((o) => o.bucket === "b2");

  console.log("=== Reconcile municipales 2026 — DRY RUN ===");
  console.log(`Mandats MAIRE RNE isCurrent (avec commune): ${mandates.length}`);
  console.log(`Maires-désignés 2026 indexés:               ${byCommune.size}`);
  console.log("");
  console.log(`(a) réélu / même maire (OK):                ${reelected}`);
  console.log(`(b1) OBSOLÈTE haute confiance (0 match nom): ${b1.length}`);
  console.log(`(b2) obsolète mais prénom identique (bruit): ${b2.length}`);
  console.log(`(c) pas de maire-désigné 2026:               ${noData}`);
  console.log("");
  console.log("Répartition des obsolètes par taille de commune (population):");
  for (const key of [">=20000", "3500-20000", "1000-3500", "<1000", "pop inconnue"]) {
    const v = bandCount[key];
    if (v) console.log(`  ${key.padEnd(14)} b1=${v.b1}  b2=${v.b2}`);
  }

  // CSV of all obsolete for spot-checking against resultats-elections.interieur.gouv.fr
  const header = "bucket,dept,communeId,communeName,population,dbMayor,winner2026\n";
  const rows = obsolete
    .sort((a, b) => a.commune.localeCompare(b.commune))
    .map(
      (o) =>
        `${o.bucket},${o.dept},${o.commune},"${o.communeName.replace(/"/g, "'")}",${o.pop ?? ""},"${o.dbMayor.replace(/"/g, "'")}","${o.winner.replace(/"/g, "'")}"`
    )
    .join("\n");
  writeFileSync(CSV_PATH, header + rows + "\n");
  console.log(`\nCSV écrit: ${CSV_PATH} (${obsolete.length} lignes)`);

  console.log("\nÉchantillon b1 (haute confiance):");
  for (const o of b1.slice(0, 20)) {
    console.log(
      `  ${o.dept} ${o.commune} ${o.communeName}: "${o.dbMayor}" -> "${o.winner}" (pop ${o.pop ?? "?"})`
    );
  }

  if (APPLY_PHASE1) {
    console.log(`\n>>> APPLY PHASE 1: clôture de ${b1.length} mandats obsolètes (b1) ...`);
    const ids = b1.map((o) => o.mandateId);
    let done = 0;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const res = await db.mandate.updateMany({
        where: { id: { in: chunk }, isCurrent: true },
        data: { isCurrent: false, endDate: INSTALL_DATE },
      });
      done += res.count;
      console.log(`  ...${done}/${ids.length}`);
    }
    console.log(`Phase 1 terminée: ${done} mandats clos.`);
  } else {
    console.log(
      "\n(dry-run — aucune écriture. Relancer avec --apply-phase1 pour clôturer les b1.)"
    );
  }

  // Phase 2 & 3 (self-contained load so Phase 1 above stays untouched).
  const phaseData = await loadPhaseData();
  const phaseClass = buildPhaseClassification(phaseData.mandates, phaseData.byCommune);
  await runPhase2(phaseClass.linkables);
  await runPhase3(phaseData.byCommune);

  await db.$disconnect();
}

// Guarded so importing this module (e.g. from the nameMatchesWinner unit test)
// never touches the database: main() only runs when this file is the process
// entry point, not on import.
if (require.main === module) {
  main().catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
}
