import type React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown";
import { Sparkles, Lightbulb } from "lucide-react";
import { ANALYSIS_SOURCE_TYPE_LABELS } from "@/config/labels";
import type { ReasonSpeakerView, ReasonView, ScrutinAnalysisData } from "@/lib/data/groupes";
import type { AnalysisSourceType } from "@/types";

interface ScrutinContextProps {
  summary: string | null;
  citizenImpact: string | null;
  analysis: ScrutinAnalysisData | null;
  isKeyVote: boolean;
  votesDetailSlot?: React.ReactNode;
}

// Generic AI placeholder phrases that add no value - skip these summaries
const GENERIC_SUMMARY_PATTERNS = [
  "contenu exact n'est pas",
  "contenu exact n\u2019est pas",
  "n'est pas spécifié",
  "n\u2019est pas spécifié",
  "pas encore disponible",
  "information non disponible",
  "sujet important mais son contenu",
];

function isGenericSummary(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_SUMMARY_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export function ScrutinContext({
  summary,
  citizenImpact,
  analysis,
  isKeyVote,
  votesDetailSlot,
}: ScrutinContextProps) {
  const usableSummary = summary && !isGenericSummary(summary) ? summary : null;
  const hasChange = !!citizenImpact || !!usableSummary;
  const showDebate = !!(isKeyVote && analysis);
  const reasons = showDebate ? (analysis!.reasons ?? null) : null;

  if (!hasChange && !showDebate && !votesDetailSlot) return null;

  return (
    <div className="mb-8 space-y-6">
      {hasChange && <ChangeCard summary={usableSummary} citizenImpact={citizenImpact} />}
      {showDebate &&
        (reasons ? (
          <DebateCard analysis={analysis!} reasons={reasons} />
        ) : (
          <LegacyEnjeuxContent analysis={analysis!} />
        ))}
      {votesDetailSlot && (
        <section aria-labelledby="votes-individuels">
          <h2 id="votes-individuels" className="title-section mb-4">
            Votes individuels
          </h2>
          {votesDetailSlot}
        </section>
      )}
    </div>
  );
}

/** What the vote changes: the plain summary leads, the effect on readers and society follows. */
function ChangeCard({
  summary,
  citizenImpact,
}: {
  summary: string | null;
  citizenImpact: string | null;
}) {
  return (
    <Card className="gap-3 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <h2 className="title-section">{citizenImpact ? "Ce que ça change" : "Résumé"}</h2>
          {citizenImpact && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Décryptage IA
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary && citizenImpact && (
          <MarkdownText className="text-base leading-snug">{summary}</MarkdownText>
        )}
        {citizenImpact ? (
          <div className="rounded-lg bg-background/70 px-4 py-3">
            {summary && (
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pour vous et pour la société
              </h3>
            )}
            <MarkdownText className="text-sm">{citizenImpact}</MarkdownText>
          </div>
        ) : (
          summary && <MarkdownText className="text-sm">{summary}</MarkdownText>
        )}
      </CardContent>
    </Card>
  );
}

function SpeakerTag({ speaker }: { speaker: ReasonSpeakerView }) {
  const tag = speaker.government ? "Gouvernement" : speaker.groupCode;
  const title = speaker.government
    ? (speaker.role ?? "Gouvernement")
    : (speaker.groupName ?? undefined);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {speaker.slug ? (
        <Link
          href={`/politiques/${speaker.slug}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-primary"
          aria-label={`Fiche de ${speaker.name}`}
        >
          {speaker.name}
        </Link>
      ) : (
        <span className="font-semibold text-foreground">{speaker.name}</span>
      )}
      {tag && (
        <Badge variant="outline" className="text-xs font-normal" title={title}>
          {tag}
        </Badge>
      )}
    </span>
  );
}

function ReasonItem({ reason }: { reason: ReasonView }) {
  return (
    <li className="space-y-1.5 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <p className="text-base leading-snug">{reason.text}</p>
      <div className="flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
        {reason.speakers.map((sp) => (
          <SpeakerTag key={sp.name} speaker={sp} />
        ))}
        {reason.shared && (
          <Badge variant="outline" className="text-xs font-normal">
            Discussion commune
          </Badge>
        )}
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer items-center">
          Voir ce qui a été dit
        </summary>
        {reason.quotes.map((q) => (
          <blockquote
            key={`${q.speaker}-${q.text}`}
            className="mt-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground"
          >
            « {q.text} »
            <cite className="mt-1 block text-xs not-italic text-muted-foreground">{q.speaker}</cite>
          </blockquote>
        ))}
      </details>
    </li>
  );
}

function ReasonsSide({
  side,
  label,
  reasons,
  empty,
}: {
  side: "pour" | "contre";
  label: string;
  reasons: ReasonView[];
  empty: string;
}) {
  const color = side === "pour" ? "var(--vote-pour)" : "var(--vote-contre)";
  return (
    <section aria-label={label} className="min-w-0 space-y-3">
      <h3
        className="title-card flex items-center gap-2.5 border-b-[3px] pb-2"
        style={{ borderColor: color }}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-sm leading-none text-card"
          style={{ backgroundColor: color }}
        >
          {side === "pour" ? "+" : "\u2212"}
        </span>
        {label}
      </h3>
      {reasons.length ? (
        <ul className="space-y-4">
          {reasons.map((r) => (
            <ReasonItem key={r.text} reason={r} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function DebateCard({
  analysis,
  reasons,
}: {
  analysis: ScrutinAnalysisData;
  reasons: NonNullable<ScrutinAnalysisData["reasons"]>;
}) {
  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="title-section">Ce qui a été dit dans le débat</h2>
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Synthèse Mistral
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {analysis.commonDiscussion && (
          <p className="text-sm text-muted-foreground">
            Cet amendement a été discuté avec d’autres amendements. Les arguments communs sont
            signalés dans la synthèse.
          </p>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <ReasonsSide
            side="pour"
            label="Pourquoi pour"
            reasons={reasons.for}
            empty="Aucune raison en faveur de la mesure n’a pu être identifiée dans ce passage du débat."
          />
          <ReasonsSide
            side="contre"
            label="Pourquoi contre"
            reasons={reasons.against}
            empty="Aucune raison contre la mesure n’a pu être identifiée dans ce passage du débat."
          />
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Synthèse Mistral - Sources :{" "}
            {analysis.sourceUrl ? (
              <a
                href={analysis.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Consulter le compte rendu sur le site de l’Assemblée nationale"
                className="inline-flex min-h-11 items-center underline"
              >
                Compte rendu de l’Assemblée nationale
              </a>
            ) : (
              ANALYSIS_SOURCE_TYPE_LABELS[analysis.sourceType as AnalysisSourceType]
            )}
          </p>
          <p>
            Chaque raison renvoie aux phrases exactes du compte rendu. Seules les raisons que la
            synthèse a pu rapporter fidèlement sont affichées : ce n’est pas une liste complète du
            débat.
          </p>
          <p>
            Le groupe affiché est celui du député aujourd’hui. Pour un vote ancien, il peut différer
            de celui du jour du vote.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LegacyEnjeuxContent({ analysis }: { analysis: ScrutinAnalysisData }) {
  return (
    <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-900">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Les enjeux du vote</h3>
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            Synthèse Mistral
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {analysis.commonDiscussion && (
          <p className="text-sm text-muted-foreground mb-4">
            Cet amendement a été discuté avec d’autres amendements. Les arguments communs sont
            signalés dans la synthèse.
          </p>
        )}
        {/* Desktop: 2 columns */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-6 md:divide-x">
          <div className="pr-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-6 rounded-full bg-green-500" />
              <h4 className="font-semibold text-sm text-green-700 dark:text-green-400">
                Arguments pour
              </h4>
            </div>
            <MarkdownText className="text-sm text-purple-700 dark:text-purple-300">
              {analysis.argumentsFor || "Aucun argument en faveur identifié dans ce passage."}
            </MarkdownText>
          </div>
          <div className="pl-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1 h-6 rounded-full bg-red-500" />
              <h4 className="font-semibold text-sm text-red-700 dark:text-red-400">
                Arguments contre
              </h4>
            </div>
            <MarkdownText className="text-sm text-purple-700 dark:text-purple-300">
              {analysis.argumentsAgainst || "Aucun argument contre identifié dans ce passage."}
            </MarkdownText>
          </div>
        </div>

        {/* Mobile: stacked */}
        <div className="md:hidden space-y-4">
          <div className="border-l-4 border-green-500 pl-3">
            <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 mb-1">
              Arguments pour
            </h4>
            <MarkdownText className="text-sm text-purple-700 dark:text-purple-300">
              {analysis.argumentsFor || "Aucun argument en faveur identifié dans ce passage."}
            </MarkdownText>
          </div>
          <div className="border-l-4 border-red-500 pl-3">
            <h4 className="font-semibold text-sm text-red-700 dark:text-red-400 mb-1">
              Arguments contre
            </h4>
            <MarkdownText className="text-sm text-purple-700 dark:text-purple-300">
              {analysis.argumentsAgainst || "Aucun argument contre identifié dans ce passage."}
            </MarkdownText>
          </div>
        </div>

        {/* Attribution */}
        <p className="text-xs text-purple-600 dark:text-purple-400 mt-4">
          Synthèse Mistral - Sources :{" "}
          {analysis.sourceUrl ? (
            <a
              href={analysis.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Consulter le compte rendu sur le site de l’Assemblée nationale"
              className="inline-flex min-h-11 items-center underline"
            >
              Compte rendu de l’Assemblée nationale
            </a>
          ) : (
            ANALYSIS_SOURCE_TYPE_LABELS[analysis.sourceType as AnalysisSourceType]
          )}
        </p>
        {!analysis.sourceUrl && (
          <p className="text-xs text-muted-foreground mt-1">
            Les groupes cités reposent sur l&apos;appartenance actuelle des députés, non datée au
            moment du vote.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
