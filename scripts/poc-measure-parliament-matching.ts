#!/usr/bin/env tsx
/**
 * POC read-only : propose des rapprochements entre mesures présidentielles publiées et dossiers
 * législatifs, puis produit une page de revue par lots. Aucune écriture en base : seuls les fichiers
 * du dossier --out sont écrits. Le modèle propose, un humain tranche, aucune polarité de vote.
 *
 *   npx tsx --env-file=.env scripts/poc-measure-parliament-matching.ts --out=/chemin --dry-run
 *   npx tsx --env-file=.env scripts/poc-measure-parliament-matching.ts --out=/chemin --measures=50
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  callMistral,
  callMistralEmbeddings,
  extractMistralText,
  getMistralTokensUsed,
  parseMistralJSON,
} from "@/lib/api/mistral";
import { db } from "@/lib/db";
import type { ThemeCategory } from "@/generated/prisma";
import { getParliamentThemeTarget } from "@/lib/presidentielle/parliament-bridge";
import {
  QUALIFICATION_SCHEMA,
  assignReviewTier,
  buildQualificationPrompt,
  cosine,
  embeddingCacheKey,
  evaluate,
  isGenericEvidence,
  MIN_SHARED_TERMS,
  sharedDistinctiveTerms,
  fuseRankings,
  isQuoteVerified,
  lexicalOverlap,
  parseQualification,
  type Judgement,
  type Qualification,
  type ReviewRow,
} from "@/lib/measures/parliament-matching/matching";
import { renderReviewPage } from "@/lib/measures/parliament-matching/review-page";

const EMBED_MODEL = "mistral-embed";
const CHAT_MODEL = "mistral-large-latest";
const RETRIEVE_K = 10;
// Only the best candidates are qualified: 91 % of the pairs of the first run were rejected.
const DEFAULT_QUALIFY_K = 5;
// Floor on the measure/dossier cosine, to be calibrated on the reference set (--min-cosine).
const DEFAULT_MIN_COSINE = 0.65;
const DOC_CHARS = 1200;

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

interface Doc {
  id: string;
  title: string;
  body: string;
  slug: string;
  theme: ThemeCategory;
}
interface Meas {
  id: string;
  slug: string;
  text: string;
  theme: ThemeCategory;
}

/** Stable pseudo-random order so two runs on the same data pick the same sample. */
function stableKey(id: string): number {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function sampleMeasures(all: Meas[], n: number): Meas[] {
  const byTheme = new Map<ThemeCategory, Meas[]>();
  for (const m of all) {
    const list = byTheme.get(m.theme) ?? [];
    list.push(m);
    byTheme.set(m.theme, list);
  }
  const queues = [...byTheme.entries()]
    .toSorted((l, r) => l[0].localeCompare(r[0]))
    .map(([, list]) => list.toSorted((l, r) => stableKey(l.id) - stableKey(r.id)));
  const out: Meas[] = [];
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < n) out.push(next);
    }
  }
  return out;
}

const CALL_TIMEOUT_MS = 90_000;
const CONCURRENCY = 4;

function withTimeout<T>(call: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Mistral call timeout")), CALL_TIMEOUT_MS);
    call().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Retries a call on a 429 or a timeout (a stalled socket after a sleep never fails by itself). */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(call);
    } catch (error) {
      const retryable =
        error instanceof Error && /Mistral API error 429|Mistral call timeout/.test(error.message);
      if (!retryable || attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000 * 2 ** attempt));
    }
  }
}

interface QualifyTask {
  key: string;
  measure: Meas;
  doc: Doc;
  rank: number;
}

/** Runs the tasks with a small pool; every result is appended to `checkpointPath` as soon as it lands. */
async function qualifyAll(
  tasks: QualifyTask[],
  done: Map<string, Qualification | null>,
  checkpointPath: string
): Promise<void> {
  const todo = tasks.filter((t) => !done.has(t.key));
  console.log(
    `[poc] qualification : ${todo.length} à faire, ${tasks.length - todo.length} déjà faites`
  );
  const started = Date.now();
  let finished = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const task = todo[next++]!;
      const res = await withRetry(() =>
        callMistral(
          [
            {
              role: "user",
              content: buildQualificationPrompt(task.measure.text, task.doc.title, task.doc.body),
            },
          ],
          {
            model: CHAT_MODEL,
            temperature: 0,
            maxTokens: 500,
            responseFormat: {
              type: "json_schema",
              json_schema: { name: "qualification", schema: QUALIFICATION_SCHEMA, strict: true },
            },
          }
        )
      );
      const q = parseQualification(parseMistralJSON(extractMistralText(res)));
      done.set(task.key, q);
      appendFileSync(checkpointPath, `${JSON.stringify({ key: task.key, q })}\n`);
      finished++;
      if (finished % 50 === 0 || finished === todo.length) {
        const minutes = (Date.now() - started) / 60000;
        const left = Math.round((minutes / finished) * (todo.length - finished));
        console.log(
          `[poc] ${finished}/${todo.length} (${minutes.toFixed(1)} min, reste ≈${left} min)`
        );
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function embedAll(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const res = await callMistralEmbeddings(texts.slice(i, i + 16), { model: EMBED_MODEL });
    for (const d of res.data.toSorted((l, r) => l.index - r.index)) vectors.push(d.embedding);
  }
  return vectors;
}

interface Proposal extends ReviewRow {
  measureText: string;
  measureSlug: string;
  textSlug: string;
  q: Qualification;
  rank: number;
}

async function main(): Promise<void> {
  const out = arg("out");
  if (!out) throw new Error("--out=<dossier> est requis");
  mkdirSync(out, { recursive: true });
  const n = Number(arg("measures", "50"));
  const dryRun = flag("dry-run");
  const qualifyK = Number(arg("qualify-k", String(DEFAULT_QUALIFY_K)));
  const minCosine = Number(arg("min-cosine", String(DEFAULT_MIN_COSINE)));
  if (!dryRun && !process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY doit être définie");

  const rows = await db.measure.findMany({
    where: {
      publicationStatus: "PUBLISHED",
      withdrawnAt: null,
      publishedRevisionId: { not: null },
    },
    select: { id: true, slug: true, theme: true, publishedRevision: { select: { text: true } } },
  });
  const all: Meas[] = rows.flatMap((r) =>
    r.publishedRevision
      ? [{ id: r.id, slug: r.slug, theme: r.theme, text: r.publishedRevision.text }]
      : []
  );
  const sample = sampleMeasures(all, n);

  const dossiers = await db.legislativeDossier.findMany({
    where: { theme: { not: null }, slug: { not: null } },
    select: {
      id: true,
      slug: true,
      title: true,
      theme: true,
      exposeDesMotifs: true,
    },
  });
  const docs: Doc[] = dossiers.map((d) => ({
    id: d.id,
    slug: d.slug!,
    theme: d.theme!,
    title: d.title,
    // Official statement of reasons only: the AI summary must never be the evidence.
    body: `${d.title}\n${d.exposeDesMotifs ?? ""}`.slice(0, DOC_CHARS),
  }));

  const usable = sample.filter((m) => getParliamentThemeTarget(m.theme) !== null);
  const estTokens = Math.round(
    (docs.length * DOC_CHARS + usable.length * 300) / 3.5 + usable.length * qualifyK * 900
  );
  console.log(
    `[poc] mesures=${usable.length}/${sample.length} dossiers=${docs.length} jetons estimés≈${estTokens}`
  );
  if (dryRun) return;

  const cachePath = join(out, "embeddings.json");
  const cache: Record<string, number[]> = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, "utf8"))
    : {};
  const need = [
    ...docs.map((d) => [embeddingCacheKey("d", d.id, d.body), d.body] as const),
    ...usable.map((m) => [embeddingCacheKey("m", m.id, m.text), m.text] as const),
  ].filter(([k]) => !cache[k]);
  const vectors = await embedAll(need.map(([, t]) => t));
  need.forEach(([k], i) => (cache[k] = vectors[i]!));
  writeFileSync(cachePath, JSON.stringify(cache));

  const retrieved = new Map<string, string[]>();
  const tasks: QualifyTask[] = [];
  for (const m of usable) {
    const target = getParliamentThemeTarget(m.theme)!;
    const pool = docs.filter((d) => d.theme === target.theme);
    const mv = cache[embeddingCacheKey("m", m.id, m.text)]!;
    const sem = pool
      .map((d) => [d.id, cosine(mv, cache[embeddingCacheKey("d", d.id, d.body)]!)] as const)
      .toSorted((l, r) => r[1] - l[1])
      .map(([id]) => id);
    const lex = pool
      .map((d) => [d.id, lexicalOverlap(m.text, d.body)] as const)
      .toSorted((l, r) => r[1] - l[1])
      .map(([id]) => id);
    const top = fuseRankings(sem.slice(0, 50), lex.slice(0, 50)).slice(0, RETRIEVE_K);
    retrieved.set(m.id, top);

    for (const [rank, id] of top.slice(0, qualifyK).entries()) {
      const d = pool.find((x) => x.id === id)!;
      if (cosine(mv, cache[embeddingCacheKey("d", d.id, d.body)]!) < minCosine) continue;
      tasks.push({
        key: embeddingCacheKey("q", `${m.id}:${d.id}`, `${m.text}\u0000${d.body}`),
        measure: m,
        doc: d,
        rank,
      });
    }
  }

  // Résultats déjà obtenus (reprise après une coupure) : un par ligne, clé liée aux deux textes.
  const checkpointPath = join(out, "qualifications.jsonl");
  const done = new Map<string, Qualification | null>();
  if (existsSync(checkpointPath)) {
    for (const line of readFileSync(checkpointPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { key: string; q: Qualification | null };
      done.set(row.key, row.q);
    }
  }
  await qualifyAll(tasks, done, checkpointPath);

  const proposals: Proposal[] = [];
  for (const t of tasks) {
    const q = done.get(t.key);
    if (!q) continue;
    const { measure: m, doc: d } = t;
    const tier = assignReviewTier(q, {
      measure: isQuoteVerified(q.measureQuote, m.text),
      text: isQuoteVerified(q.textQuote, d.body),
      specific: !isGenericEvidence(q, d.title),
      vocabulary: sharedDistinctiveTerms(m.text, d.body) >= MIN_SHARED_TERMS,
    });
    proposals.push({
      measureId: m.id,
      measureSlug: m.slug,
      measureText: m.text,
      textId: d.id,
      textSlug: d.slug,
      textTitle: d.title,
      tier,
      q,
      rank: t.rank,
    });
  }

  writeFileSync(join(out, "proposals.jsonl"), proposals.map((p) => JSON.stringify(p)).join("\n"));
  writeFileSync(
    join(out, "review.html"),
    renderReviewPage(proposals, { measures: usable.length, pairs: proposals.length })
  );

  const refPath = arg("reference");
  const kept = proposals.filter((p) => p.tier !== "REJETE");
  const metrics = {
    measures: usable.length,
    pairsQualified: proposals.length,
    proposed: kept.length,
    lotPret: kept.filter((p) => p.tier === "LOT_PRET").length,
    tokens: getMistralTokensUsed(),
    ...(refPath
      ? evaluate(JSON.parse(readFileSync(refPath, "utf8")) as Judgement[], retrieved, kept)
      : {}),
  };
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 2));
  console.log("[poc]", metrics);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
