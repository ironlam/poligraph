import { ArrowRight } from "lucide-react";
import { SourceLine } from "@/components/ui/SourceLine";
import { BRIDGE_STEPS, SOURCE_DECREE, SOURCE_ELECTORAL_CODE, SOURCE_SENAT } from "../_content";

/**
 * The thesis of the page, and therefore its first block of content: the September
 * ballot does not create its electorate, it inherits it from the councils elected in
 * March.
 *
 * Rendered as an ordered list because the four steps are a sequence, not a set of
 * statistics. The arrows are decorative on desktop and disappear on mobile, where the
 * vertical stack already carries the ordering.
 */
export function MunicipalBridge() {
  return (
    <section aria-labelledby="pont-heading" className="space-y-4">
      <div className="space-y-2">
        <h2 id="pont-heading" className="font-display text-xl font-bold tracking-tight md:text-2xl">
          De votre conseil municipal au Sénat
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
          Le scrutin de septembre ne crée pas son électorat, il l{"'"}hérite. Le corps qui élit les
          sénateurs a été composé par les conseils municipaux installés après les municipales, puis
          désigné le 5 juin.
        </p>
      </div>

      <ol className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch md:gap-2">
        {BRIDGE_STEPS.map((step, index) => (
          <li key={step.when} className="contents">
            <div className="h-full rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-on-surface">
                {step.when}
              </p>
              <p className="mt-1.5 font-semibold leading-snug">{step.headline}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
            </div>
            {index < BRIDGE_STEPS.length - 1 && (
              <div
                aria-hidden="true"
                className="hidden items-center justify-center text-muted-foreground md:flex"
              >
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </li>
        ))}
      </ol>

      <SourceLine
        sources={[SOURCE_SENAT, SOURCE_DECREE, SOURCE_ELECTORAL_CODE]}
        note="Répartition du collège publiée par le Sénat"
      />
    </section>
  );
}
