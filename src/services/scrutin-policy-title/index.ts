import { db } from "@/lib/db";
import { callMistral, extractMistralText } from "@/lib/api/mistral";
import { resolveSubstanceSources } from "./substance-resolver";
import { extractEvidenceCandidates } from "./evidence-extractor";
import { computeInputHash, type InputHashInput } from "./input-hash";
import { buildPrompt, PROMPT_VERSION } from "./prompt";
import { parsePolicyTitleOutput } from "./parse-output";
import { runValidators } from "./validators";
import { deriveConfidence, deriveStatus } from "./confidence";
import type {
  GenerateOptions,
  GenerateResult,
  GenerateResultDebug,
  GenerationWarning,
  PolicyTitleOutput,
  QualitySignals,
  SubstanceTextBlock,
} from "./types";
import type { Prisma } from "@/generated/prisma";

/** Mistral model used for policy-title generation. Not exported by the mistral lib. */
const MISTRAL_MODEL = "mistral-large-latest";

interface ScrutinAmendmentLink {
  role: string;
  amendment: { id: string; number: string };
}

interface LoadedScrutin {
  id: string;
  externalId: string;
  title: string;
  sourceUrl: string | null;
  votingDate: Date;
  result: string;
  citizenImpact: string | null;
  dossierLegislatifId: string | null;
  amendmentLinks: ScrutinAmendmentLink[];
}

/**
 * Hard guard: the generator must NEVER write an APPROVED row. Publication is
 * always a human decision (see confidence.ts deriveStatus, which never emits
 * APPROVED). Called by the write helper before every persist.
 */
export function assertNotApprovedByGenerator(status: string): void {
  if (status === "APPROVED") {
    throw new Error("Generator must never write APPROVED");
  }
}

/**
 * Deterministic procedural label from the scrutin's amendment links. Prefers a
 * sub-amendment, then a principal/parent amendment, else a generic fallback.
 */
export function proceduralLabel(links: ScrutinAmendmentLink[]): string {
  const sub = links.find((l) => l.role === "SUB_AMENDMENT");
  if (sub) return `Sous-amendement n°${sub.amendment.number}`;
  const principal = links.find((l) => l.role === "PRINCIPAL" || l.role === "PARENT_AMENDMENT");
  if (principal) return `Amendement n°${principal.amendment.number}`;
  return "Scrutin";
}

/**
 * Assembles the exact InputHashInput shape fed to `computeInputHash`. Shared by
 * the orchestrator AND the STALE detector (`detect-stale-policy-titles.ts`) so
 * both compute identical hashes from the same scrutin + resolved blocks. Any
 * drift here would falsely flag every APPROVED row STALE.
 */
export function buildInputHashInput(
  scrutin: Pick<LoadedScrutin, "title" | "sourceUrl" | "amendmentLinks">,
  label: string,
  blocks: SubstanceTextBlock[]
): InputHashInput {
  return {
    scrutinTitle: scrutin.title,
    scrutinSourceUrl: scrutin.sourceUrl,
    proceduralLabel: label,
    links: scrutin.amendmentLinks.map((l) => ({
      amendmentId: l.amendment.id,
      amendmentNumber: l.amendment.number,
      role: l.role,
    })),
    sources: blocks.map((b) => ({
      sourceType: b.sourceType,
      sourceId: b.sourceId,
      field: b.field,
      text: b.text,
    })),
  };
}

function modelVersionString(opts: GenerateOptions): string {
  const date = opts.modelVersionDate ?? new Date().toISOString().slice(0, 10);
  return `${MISTRAL_MODEL}@${date}`;
}

function sourcesProvenance(blocks: SubstanceTextBlock[]): Prisma.InputJsonValue {
  return blocks.map((b) => ({
    sourceType: b.sourceType,
    sourceId: b.sourceId,
    field: b.field,
    trust: b.trust,
    url: b.url ?? null,
  }));
}

/** Lexical evidence coverage: fraction of the title's content tokens grounded in
 *  the official evidence corpus. WEAK signal, lexical only (a stem substring
 *  match tolerates simple inflection, e.g. "dérogations" vs "dérogation"). */
function computeEvidenceCoverage(title: string, evidenceTexts: string[]): number {
  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const titleTokens = normalize(title)
    .split(" ")
    .filter((w) => w.length > 3);
  if (titleTokens.length === 0) return 0;
  const haystack = normalize(evidenceTexts.join(" "));
  const hits = titleTokens.filter((t) => haystack.includes(t.slice(0, Math.min(5, t.length))));
  return hits.length / titleTokens.length;
}

interface WriteArgs {
  scrutin: LoadedScrutin;
  inputHash: string;
  policyTitle: string | null;
  policySubtitle: string | null;
  proceduralLabel: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  qualitySignals: QualitySignals;
  generationSource: "LLM" | "FALLBACK";
  modelVersion: string;
  promptVersion: string;
  evidenceQuotes: Prisma.InputJsonValue;
  warnings: GenerationWarning[];
  blocks: SubstanceTextBlock[];
  status: "DRAFT" | "NEEDS_REVIEW";
  force: boolean;
  createRevision: boolean;
}

async function writePolicyTitleRow(args: WriteArgs): Promise<void> {
  assertNotApprovedByGenerator(args.status);

  const warningsJson = args.warnings as unknown as Prisma.InputJsonValue;
  const qualityJson = args.qualitySignals as unknown as Prisma.InputJsonValue;
  const inputsJson: Prisma.InputJsonValue = {
    amendmentIds: args.scrutin.amendmentLinks.map((l) => l.amendment.id),
    dossierId: args.scrutin.dossierLegislatifId,
  };
  const now = new Date();

  const data = {
    officialTitleSnapshot: args.scrutin.title,
    officialSourceUrl: args.scrutin.sourceUrl,
    sources: sourcesProvenance(args.blocks),
    inputHash: args.inputHash,
    policyTitle: args.policyTitle,
    policySubtitle: args.policySubtitle,
    proceduralLabel: args.proceduralLabel,
    confidence: args.confidence,
    qualitySignals: qualityJson,
    generationSource: args.generationSource,
    modelVersion: args.modelVersion,
    promptVersion: args.promptVersion,
    evidenceQuotes: args.evidenceQuotes,
    generationWarnings: warningsJson,
    currentWarnings: warningsJson,
    inputs: inputsJson,
    status: args.status,
    // A (re)generation is a fresh draft: reset the age/review bookkeeping so a
    // forced regen of an old row is not immediately auto-approvable (the veto
    // window in autoApproveBatchEligible keys off generatedAt) and so it does
    // not carry over a stale human review or a mid-flight regeneration state.
    generatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    editedFromGenerated: false,
    regenerationStatus: "idle" as const,
    regenerationError: null,
  };

  await db.$transaction(async (tx) => {
    const existing = await tx.scrutinPolicyTitle.findUnique({
      where: { scrutinId: args.scrutin.id },
    });

    if (existing) {
      if (args.force && args.createRevision) {
        await tx.scrutinPolicyTitleRevision.create({
          data: {
            policyTitleId: existing.id,
            snapshot: existing as unknown as Prisma.InputJsonValue,
            action: "regenerated",
          },
        });
      }
      await tx.scrutinPolicyTitle.update({ where: { id: existing.id }, data });
    } else {
      await tx.scrutinPolicyTitle.create({
        data: { scrutinId: args.scrutin.id, ...data },
      });
    }
  });
}

/**
 * Orchestrates policy-title generation for a single scrutin: resolve substance,
 * build prompt, call the (mockable) LLM, validate, derive confidence/status, and
 * persist a DRAFT or NEEDS_REVIEW row. Never writes APPROVED. Respects dryRun
 * (no persist), force (overwrite + revision), and the link gate.
 */
export async function generateScrutinPolicyTitle(
  scrutinId: string,
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  const force = opts.force ?? false;
  const createRevision = opts.createRevision ?? true;
  const dryRun = opts.dryRun ?? false;
  const promptVersion = opts.promptVersion ?? PROMPT_VERSION;
  const modelVersion = modelVersionString(opts);

  const scrutin = (await db.scrutin.findUnique({
    where: { id: scrutinId },
    select: {
      id: true,
      externalId: true,
      title: true,
      sourceUrl: true,
      votingDate: true,
      result: true,
      citizenImpact: true,
      dossierLegislatifId: true,
      amendmentLinks: {
        select: {
          role: true,
          amendment: { select: { id: true, number: true } },
        },
      },
    },
  })) as LoadedScrutin | null;

  if (!scrutin) {
    throw new Error(`Scrutin not found: ${scrutinId}`);
  }

  const label = proceduralLabel(scrutin.amendmentLinks);

  // ── Link gate ──────────────────────────────────────────────────────────────
  if (scrutin.amendmentLinks.length === 0) {
    const warning: GenerationWarning = {
      code: "NO_LINKED_AMENDMENT",
      severity: "blocker",
      message: "Aucun amendement lié à ce scrutin.",
    };
    if (!opts.allowUnlinkedFallback) {
      return {
        scrutinId,
        outcome: "skipped",
        status: null,
        confidence: null,
        policyTitle: null,
        written: false,
        skipReason: "NO_LINKED_AMENDMENT",
        warnings: [warning],
      };
    }
    return fallbackResult({
      scrutin,
      label,
      modelVersion,
      promptVersion,
      blocks: [],
      inputHash: computeInputHash(
        buildInputHashInput({ ...scrutin, amendmentLinks: [] }, label, [])
      ),
      warnings: [warning],
      dryRun,
      force,
      createRevision,
      verbose: opts.verbose,
    });
  }

  // ── Existing-row gate ────────────────────────────────────────────────────────
  if (!force) {
    const existing = await db.scrutinPolicyTitle.findUnique({ where: { scrutinId } });
    if (existing) {
      return {
        scrutinId,
        outcome: "skipped",
        status: null,
        confidence: null,
        policyTitle: null,
        written: false,
        skipReason: "ROW_EXISTS",
        warnings: [],
      };
    }
  }

  // ── Substance ────────────────────────────────────────────────────────────────
  const resolved = await resolveSubstanceSources(scrutinId);
  const inputHash = computeInputHash(buildInputHashInput(scrutin, label, resolved.blocks));

  if (resolved.blocks.length === 0) {
    const warnings: GenerationWarning[] = resolved.warnings.some(
      (w) => w.code === "NO_SUBSTANCE_FOUND"
    )
      ? resolved.warnings
      : [
          ...resolved.warnings,
          {
            code: "NO_SUBSTANCE_FOUND",
            severity: "warn",
            message: "Aucune substance officielle exploitable.",
          },
        ];
    return fallbackResult({
      scrutin,
      label,
      modelVersion,
      promptVersion,
      blocks: [],
      inputHash,
      warnings,
      dryRun,
      force,
      createRevision,
      verbose: opts.verbose,
    });
  }

  // ── LLM ────────────────────────────────────────────────────────────────────
  const candidates = extractEvidenceCandidates(resolved.blocks);
  const { system, user } = buildPrompt({
    scrutinTitle: scrutin.title,
    proceduralLabel: label,
    result: scrutin.result,
    votingDate: scrutin.votingDate.toISOString().slice(0, 10),
    blocks: resolved.blocks,
    candidates,
    citizenImpact: scrutin.citizenImpact,
  });

  // ── skipLlm: resolve + build prompt, but never call the model nor write. ─────
  // Reports a structural "skipped(SKIP_LLM)" with substanceDepth-based confidence
  // so the debug script can inspect the prepared inputs without spending tokens.
  if (opts.skipLlm) {
    const structuralConfidence: "MEDIUM" | "LOW" =
      resolved.substanceDepth === "subAmendment" || resolved.substanceDepth === "amendment"
        ? "MEDIUM"
        : "LOW";
    return {
      scrutinId,
      outcome: "skipped",
      status: null,
      confidence: structuralConfidence,
      policyTitle: null,
      policySubtitle: null,
      written: false,
      skipReason: "SKIP_LLM",
      warnings: resolved.warnings,
      ...(opts.verbose
        ? {
            debug: {
              officialTitle: scrutin.title,
              officialSourceUrl: scrutin.sourceUrl,
              proceduralLabel: label,
              links: scrutin.amendmentLinks.map((l) => ({
                role: l.role,
                amendmentNumber: l.amendment.number,
                amendmentId: l.amendment.id,
              })),
              substanceDepth: resolved.substanceDepth,
              evidenceQuotes: candidates,
              confidence: structuralConfidence,
              prompt: { system, user },
            } satisfies GenerateResultDebug,
          }
        : {}),
    };
  }

  const response = await callMistral([{ role: "user", content: user }], {
    system,
    model: MISTRAL_MODEL,
    maxTokens: 1200,
    temperature: 0.3,
    responseFormat: { type: "json_object" },
  });
  const text = extractMistralText(response);

  const parsed = parsePolicyTitleOutput(text);
  if (!parsed.ok) {
    return fallbackResult({
      scrutin,
      label,
      modelVersion,
      promptVersion,
      blocks: resolved.blocks,
      inputHash,
      warnings: [
        {
          code: "LLM_OUTPUT_INVALID",
          severity: "blocker",
          message: `Sortie LLM invalide : ${parsed.diagnostic.slice(0, 120)}`,
        },
      ],
      dryRun,
      force,
      createRevision,
      verbose: opts.verbose,
    });
  }

  const output: PolicyTitleOutput = parsed.data;
  const flags = runValidators({
    policyTitle: output.policyTitle,
    policySubtitle: output.policySubtitle,
    evidenceQuotes: output.evidenceQuotes,
    blocks: resolved.blocks,
    officialTitle: scrutin.title,
  });
  const hasBlocker = flags.some((f) => f.severity === "blocker");
  const flagCodes = flags.map((f) => f.code);

  // Coverage measures how much of the title's vocabulary is grounded in the
  // official substance corpus the model worked from (the resolved blocks).
  const evidenceCoverage = computeEvidenceCoverage(
    output.policyTitle,
    resolved.blocks.map((b) => b.text)
  );

  const signals: QualitySignals = {
    hasConcreteObject:
      !flagCodes.includes("PROCEDURAL_ONLY") && !flagCodes.includes("ARTICLE_ONLY"),
    hasConcreteAction: candidates.some((c) => c.weight >= 5),
    mentionsOnlyProceduralRefs:
      flagCodes.includes("PROCEDURAL_ONLY") ||
      flagCodes.includes("ARTICLE_ONLY") ||
      flagCodes.includes("AMENDMENT_NUMBER_ONLY"),
    evidenceCoverage,
    substanceDepth: resolved.substanceDepth,
    llmSelfConfidence: output.selfConfidence,
    validationFlags: flagCodes,
  };

  const confidence = deriveConfidence(signals, flags);
  const status = deriveStatus(confidence, hasBlocker);

  if (!dryRun) {
    await writePolicyTitleRow({
      scrutin,
      inputHash,
      policyTitle: output.policyTitle,
      policySubtitle: output.policySubtitle,
      proceduralLabel: label,
      confidence,
      qualitySignals: signals,
      generationSource: "LLM",
      modelVersion,
      promptVersion,
      evidenceQuotes: output.evidenceQuotes as unknown as Prisma.InputJsonValue,
      warnings: flags,
      blocks: resolved.blocks,
      status,
      force,
      createRevision,
    });
  }

  return {
    scrutinId,
    outcome: "generated",
    status,
    confidence,
    policyTitle: output.policyTitle,
    policySubtitle: output.policySubtitle,
    written: !dryRun,
    warnings: flags,
    ...(opts.verbose
      ? {
          debug: {
            officialTitle: scrutin.title,
            officialSourceUrl: scrutin.sourceUrl,
            proceduralLabel: label,
            links: scrutin.amendmentLinks.map((l) => ({
              role: l.role,
              amendmentNumber: l.amendment.number,
              amendmentId: l.amendment.id,
            })),
            substanceDepth: resolved.substanceDepth,
            evidenceQuotes: output.evidenceQuotes,
            confidence,
            prompt: { system, user },
            rawLlmText: text,
          } satisfies GenerateResultDebug,
        }
      : {}),
  };
}

interface FallbackArgs {
  scrutin: LoadedScrutin;
  label: string;
  modelVersion: string;
  promptVersion: string;
  blocks: SubstanceTextBlock[];
  inputHash: string;
  warnings: GenerationWarning[];
  dryRun: boolean;
  force: boolean;
  createRevision: boolean;
  verbose?: boolean;
}

async function fallbackResult(args: FallbackArgs): Promise<GenerateResult> {
  const signals: QualitySignals = {
    hasConcreteObject: false,
    hasConcreteAction: false,
    mentionsOnlyProceduralRefs: false,
    evidenceCoverage: 0,
    substanceDepth: null,
    llmSelfConfidence: null,
    validationFlags: args.warnings.map((w) => w.code),
  };
  const status = "NEEDS_REVIEW" as const;
  const confidence = "LOW" as const;

  if (!args.dryRun) {
    await writePolicyTitleRow({
      scrutin: args.scrutin,
      inputHash: args.inputHash,
      policyTitle: null,
      policySubtitle: null,
      proceduralLabel: args.label,
      confidence,
      qualitySignals: signals,
      generationSource: "FALLBACK",
      modelVersion: args.modelVersion,
      promptVersion: args.promptVersion,
      evidenceQuotes: [],
      warnings: args.warnings,
      blocks: args.blocks,
      status,
      force: args.force,
      createRevision: args.createRevision,
    });
  }

  return {
    scrutinId: args.scrutin.id,
    outcome: "fallback",
    status,
    confidence,
    policyTitle: null,
    policySubtitle: null,
    written: !args.dryRun,
    warnings: args.warnings,
    ...(args.verbose
      ? {
          debug: {
            officialTitle: args.scrutin.title,
            officialSourceUrl: args.scrutin.sourceUrl,
            proceduralLabel: args.label,
            links: args.scrutin.amendmentLinks.map((l) => ({
              role: l.role,
              amendmentNumber: l.amendment.number,
              amendmentId: l.amendment.id,
            })),
            substanceDepth: null,
            evidenceQuotes: [],
            confidence,
          } satisfies GenerateResultDebug,
        }
      : {}),
  };
}
