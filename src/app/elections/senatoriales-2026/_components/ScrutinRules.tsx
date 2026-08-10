import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SourceLine } from "@/components/ui/SourceLine";
import { SCRUTIN_RULES, SOURCE_ELECTORAL_CODE } from "../_content";

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

      <dl className="grid gap-3 sm:grid-cols-2">
        {SCRUTIN_RULES.map((rule) => (
          <div key={rule.seats} className="rounded-xl border border-border p-4">
            <dt>
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-on-surface">
                {rule.seats}
              </span>
              <span className="mt-1 block font-semibold">{rule.mode}</span>
            </dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{rule.detail}</dd>
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

      <SourceLine sources={[SOURCE_ELECTORAL_CODE]} reportHref={null} />
    </section>
  );
}
