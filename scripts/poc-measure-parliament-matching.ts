#!/usr/bin/env tsx
/**
 * POC read-only : propose des rapprochements entre mesures présidentielles publiées et dossiers
 * législatifs, puis produit une page de revue par lots. Aucune écriture en base : seuls les fichiers
 * du dossier --out sont écrits. Le modèle propose, un humain tranche, aucune polarité de vote.
 *
 *   npx tsx --env-file=.env scripts/poc-measure-parliament-matching.ts --out=/chemin --dry-run
 *   npx tsx --env-file=.env scripts/poc-measure-parliament-matching.ts --out=/chemin --measures=50
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
  evaluate,
  isGenericEvidence,
  MIN_SHARED_TERMS,
  sharedDistinctiveTerms,
  fuseRankings,
  groupForBatchReview,
  isQuoteVerified,
  lexicalOverlap,
  parseQualification,
  type Judgement,
  type Qualification,
  type ReviewRow,
} from "@/lib/measures/parliament-matching/matching";

const EMBED_MODEL = "mistral-embed";
const CHAT_MODEL = "mistral-large-latest";
const RETRIEVE_K = 10;
// Only the best candidates are qualified: 91 % of the pairs of the first run were rejected.
const QUALIFY_K = 5;
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

async function embedAll(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const res = await callMistralEmbeddings(texts.slice(i, i + 16), { model: EMBED_MODEL });
    for (const d of res.data.toSorted((l, r) => l.index - r.index)) vectors.push(d.embedding);
  }
  return vectors;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface Proposal extends ReviewRow {
  measureText: string;
  measureSlug: string;
  textSlug: string;
  q: Qualification;
  rank: number;
}

function renderReview(proposals: Proposal[]): string {
  const groups = groupForBatchReview(proposals);
  const body = groups
    .map((g) => {
      const rows = g.rows
        .map(
          (r) => `<li data-tier="${r.tier}"><label>
<input type="checkbox" class="row" data-m="${esc(r.measureId)}" data-t="${esc(r.textId)}" data-kind="${esc(r.q.kind)}" ${r.tier === "LOT_PRET" ? "checked" : ""}>
<b>${esc(r.q.kind)}</b> <span class="tier">${r.tier === "LOT_PRET" ? "Lot prêt" : "À examiner"}, confiance ${esc(r.q.confidence)}</span></label>
<p>Mesure : ${esc(r.measureText)}</p>
<blockquote>Extrait mesure : « ${esc(r.q.measureQuote)} »</blockquote>
<blockquote>Extrait texte : « ${esc(r.q.textQuote)} »</blockquote>
<p class="why">${esc(r.q.rationale)}</p></li>`
        )
        .join("");
      return `<section><h2><label><input type="checkbox" class="all"> ${esc(g.textTitle)}</label>
<small>${g.rows.length} mesure(s), <a href="/parlement/dossiers/${esc(g.rows[0]!.textSlug)}">dossier</a></small></h2><ul>${rows}</ul></section>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Revue par lots</title>
<style>body{font:16px system-ui;max-width:60rem;margin:1rem auto;padding:0 1rem}section{border:1px solid #ccc;border-radius:12px;padding:12px;margin:12px 0}li{list-style:none;border-top:1px solid #eee;padding:8px 0}blockquote{margin:4px 0 4px 12px;color:#333}.why,.tier,small{color:#555}button{min-height:44px;padding:0 16px}</style></head><body>
<h1>Revue par lots</h1><p>Un lot = un dossier. Cocher le titre applique le choix à tous ses rapprochements. Les lignes « lot prêt » sont cochées d'office, décochez les exceptions. Aucun lien n'est écrit ici : l'export est un fichier de décisions.</p>
<p><button id="export">Exporter les décisions (JSON)</button> <span id="count"></span></p>${body}
<script>
const rows=[...document.querySelectorAll('.row')];const out=document.getElementById('count');
const upd=()=>out.textContent=rows.filter(r=>r.checked).length+' / '+rows.length+' retenus';
document.querySelectorAll('.all').forEach(a=>a.addEventListener('change',()=>{a.closest('section').querySelectorAll('.row').forEach(r=>r.checked=a.checked);upd()}));
rows.forEach(r=>r.addEventListener('change',upd));upd();
document.getElementById('export').addEventListener('click',()=>{const d=rows.map(r=>({measureId:r.dataset.m,textId:r.dataset.t,kind:r.dataset.kind,accepted:r.checked}));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));a.download='decisions.json';a.click()});
</script></body></html>`;
}

async function main(): Promise<void> {
  const out = arg("out");
  if (!out) throw new Error("--out=<dossier> est requis");
  mkdirSync(out, { recursive: true });
  const n = Number(arg("measures", "50"));
  const dryRun = flag("dry-run");
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
      shortTitle: true,
      theme: true,
      exposeDesMotifs: true,
    },
  });
  const docs: Doc[] = dossiers.map((d) => ({
    id: d.id,
    slug: d.slug!,
    theme: d.theme!,
    title: d.shortTitle ?? d.title,
    // Official statement of reasons only: the AI summary must never be the evidence.
    body: `${d.title}\n${d.exposeDesMotifs ?? ""}`.slice(0, DOC_CHARS),
  }));

  const usable = sample.filter((m) => getParliamentThemeTarget(m.theme) !== null);
  const estTokens = Math.round(
    (docs.length * DOC_CHARS + usable.length * 300) / 3.5 + usable.length * QUALIFY_K * 900
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
    ...docs.map((d) => [`d:${d.id}`, d.body] as const),
    ...usable.map((m) => [`m:${m.id}`, m.text] as const),
  ].filter(([k]) => !cache[k]);
  const vectors = await embedAll(need.map(([, t]) => t));
  need.forEach(([k], i) => (cache[k] = vectors[i]!));
  writeFileSync(cachePath, JSON.stringify(cache));

  const proposals: Proposal[] = [];
  const retrieved = new Map<string, string[]>();
  for (const m of usable) {
    const target = getParliamentThemeTarget(m.theme)!;
    const pool = docs.filter((d) => d.theme === target.theme);
    const mv = cache[`m:${m.id}`]!;
    const sem = pool
      .map((d) => [d.id, cosine(mv, cache[`d:${d.id}`]!)] as const)
      .toSorted((l, r) => r[1] - l[1])
      .map(([id]) => id);
    const lex = pool
      .map((d) => [d.id, lexicalOverlap(m.text, d.body)] as const)
      .toSorted((l, r) => r[1] - l[1])
      .map(([id]) => id);
    const top = fuseRankings(sem.slice(0, 50), lex.slice(0, 50)).slice(0, RETRIEVE_K);
    retrieved.set(m.id, top);

    for (const [rank, id] of top.slice(0, QUALIFY_K).entries()) {
      const d = pool.find((x) => x.id === id)!;
      if (cosine(mv, cache[`d:${d.id}`]!) < minCosine) continue;
      const res = await callMistral(
        [{ role: "user", content: buildQualificationPrompt(m.text, d.title, d.body) }],
        {
          model: CHAT_MODEL,
          temperature: 0,
          maxTokens: 500,
          responseFormat: {
            type: "json_schema",
            json_schema: { name: "qualification", schema: QUALIFICATION_SCHEMA, strict: true },
          },
        }
      );
      const q = parseQualification(parseMistralJSON(extractMistralText(res)));
      if (!q) continue;
      const tier = assignReviewTier(q, {
        measure: isQuoteVerified(q.measureQuote, m.text),
        text: isQuoteVerified(q.textQuote, d.body),
        specific: !isGenericEvidence(q, m.text, d.title),
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
        rank,
      });
    }
  }

  writeFileSync(join(out, "proposals.jsonl"), proposals.map((p) => JSON.stringify(p)).join("\n"));
  writeFileSync(join(out, "review.html"), renderReview(proposals));

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
