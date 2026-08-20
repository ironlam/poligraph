import { Suspense } from "react";
import type { HubCandidacy } from "@/lib/data/hub";
import { CandidacyFieldBrowser } from "./CandidacyFieldBrowser";

/**
 * The whole field, not the published fiches: every sourced candidacy, pressenti/envisagé included.
 *
 * `<Suspense>` because the browser reads `useSearchParams`, which without a boundary opts the whole
 * route into client-side rendering and would cost the hub its ISR.
 */
export function HubCandidacyField({ candidacies }: { candidacies: HubCandidacy[] }) {
  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-1 text-sm text-muted-foreground">
        <p>
          Le statut décrit l&apos;état de la candidature. Une mesure publiée sur Poligraph est une
          proposition sourcée, relue et accessible sur le site.
        </p>
        <p className="text-xs">Classement alphabétique par nom de famille.</p>
      </div>
      <Suspense
        fallback={<div className="h-96 rounded-xl border border-border bg-card" aria-hidden />}
      >
        <CandidacyFieldBrowser candidacies={candidacies} />
      </Suspense>
    </div>
  );
}
