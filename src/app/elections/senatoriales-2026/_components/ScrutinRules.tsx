import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SourceLine } from "@/components/ui/SourceLine";
import {
  FEHF_NOTE,
  POLL_EARLY_CLOSE_NOTE,
  SCRUTIN_RULES,
  SERIES_EXPLAINER,
  SOURCE_DECREE,
  SOURCE_ELECTORAL_CODE,
  SOURCE_FEHF_POLL,
  SOURCE_R168,
  SOURCE_SCRUTIN_MODE,
  SOURCE_TABLEAU_5,
} from "../_content";

/**
 * How the ballot works, and the door to the college page.
 *
 * The threshold is the number of seats in the department, which is why a page about a
 * national ballot keeps sending the reader back to a local figure.
 */
export function ScrutinRules() {
  return (
    <section aria-labelledby="scrutin-heading" className="space-y-4">
      <h2
        id="scrutin-heading"
        className="font-display text-xl font-bold tracking-tight md:text-2xl"
      >
        Comment fonctionne ce scrutin
      </h2>

      {/* The word "série" runs through the whole page and was defined nowhere. Stated in
          the page rather than only in the header tooltip: a definition behind a hover is
          unreachable on touch. */}
      <p className="max-w-3xl text-sm text-muted-foreground md:text-base">{SERIES_EXPLAINER}</p>

      <dl className="grid gap-3 sm:grid-cols-2">
        {SCRUTIN_RULES.map((rule) => (
          <div key={rule.seats} className="rounded-xl border border-border p-4">
            <dt>
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-on-surface">
                {rule.seats}
              </span>
              <span className="mt-1 block font-semibold">{rule.mode}</span>
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {rule.detail}
              {/* The mockup closed the proportional ballot at 17 h; article 3 of the
                  decree says 17 h 30. */}
              <span className="mt-1.5 block text-foreground">{rule.hours}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* Full-width row so the touch target is comfortably above 44px on mobile. */}
      <Link
        href="/elections/senatoriales-2026/college-electoral"
        className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Qui sont les grands électeurs ?</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Le barème appliqué à une commune réelle, et pourquoi un village pèse plus qu{"'"}une
            métropole.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {/* R. 168 lets the president close the poll early once every elector has voted, in both
          systems. Without this the closing hours read as guaranteed, and a grand électeur
          could believe turning up at 17 h is possible. */}
      <p className="text-sm leading-relaxed text-muted-foreground">{POLL_EARLY_CLOSE_NOTE}</p>

      {/* The hours above cover the 63 departments and collectivities. Stated here rather
          than beside the polling-day block so there is one caveat to keep true. */}
      <p className="text-sm leading-relaxed text-muted-foreground">{FEHF_NOTE}</p>

      {/* Three ranges, because the block draws on three: the collège (L. 280 à L. 293), the
          mode de scrutin and its thresholds (L. 294), and the early close (R. 168). Citing
          only the first would show a source that does not carry the claims above it. */}
      <SourceLine
        sources={[
          SOURCE_TABLEAU_5,
          SOURCE_ELECTORAL_CODE,
          SOURCE_SCRUTIN_MODE,
          SOURCE_DECREE,
          SOURCE_R168,
          SOURCE_FEHF_POLL,
        ]}
        note="Tableau n° 5 pour les 178, 170 et 6 sièges ; article 3 du décret et R. 168 pour les horaires des 63 circonscriptions ; article 50 du décret de 2014 pour ceux des Français de l'étranger"
        reportHref={null}
      />
    </section>
  );
}
