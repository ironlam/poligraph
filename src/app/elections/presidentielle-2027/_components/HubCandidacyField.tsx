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
    <div>
      <Suspense
        fallback={<div className="h-96 rounded-xl border border-border bg-card" aria-hidden />}
      >
        <CandidacyFieldBrowser candidacies={candidacies} />
      </Suspense>
    </div>
  );
}
