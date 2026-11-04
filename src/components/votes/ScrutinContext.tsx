import type React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MarkdownText } from "@/components/ui/markdown";
import { Sparkles, Lightbulb } from "lucide-react";
import { ANALYSIS_SOURCE_TYPE_LABELS } from "@/config/labels";
import type { ScrutinAnalysisData } from "@/lib/data/groupes";
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
  const hasEnBref = !!citizenImpact || !!usableSummary;
  const showEnjeuxTab = isKeyVote && analysis;

  if (!hasEnBref && !showEnjeuxTab && !votesDetailSlot) return null;

  const tabCount = (hasEnBref ? 1 : 0) + (showEnjeuxTab ? 1 : 0) + (votesDetailSlot ? 1 : 0);

  // Single section, no tabs needed
  if (tabCount <= 1 && !showEnjeuxTab && !votesDetailSlot) {
    if (hasEnBref) {
      return <EnBrefContent summary={usableSummary} citizenImpact={citizenImpact} />;
    }
    return null;
  }

  return (
    <Tabs
      defaultValue={hasEnBref ? "en-bref" : showEnjeuxTab ? "enjeux" : "votes"}
      className="mb-8"
    >
      <TabsList variant="line">
        {hasEnBref && <TabsTrigger value="en-bref">En bref</TabsTrigger>}
        {showEnjeuxTab && <TabsTrigger value="enjeux">Les enjeux</TabsTrigger>}
        {votesDetailSlot && <TabsTrigger value="votes">Votes individuels</TabsTrigger>}
      </TabsList>

      {hasEnBref && (
        <TabsContent value="en-bref">
          <EnBrefContent summary={usableSummary} citizenImpact={citizenImpact} />
        </TabsContent>
      )}

      {showEnjeuxTab && (
        <TabsContent value="enjeux">
          <EnjeuxContent analysis={analysis!} />
        </TabsContent>
      )}

      {votesDetailSlot && <TabsContent value="votes">{votesDetailSlot}</TabsContent>}
    </Tabs>
  );
}

function EnBrefContent({
  summary,
  citizenImpact,
}: {
  summary: string | null;
  citizenImpact: string | null;
}) {
  const content = citizenImpact || summary;
  if (!content) return null;

  const isCitizenImpact = !!citizenImpact;

  return (
    <Card className="gap-2 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
      <CardHeader className="pb-0">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-semibold">
            {isCitizenImpact ? "Ce que ça change pour vous" : "Résumé"}
          </h3>
          {isCitizenImpact && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              Décryptage IA
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <MarkdownText className="text-sm">{content}</MarkdownText>
      </CardContent>
    </Card>
  );
}

function EnjeuxContent({ analysis }: { analysis: ScrutinAnalysisData }) {
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
