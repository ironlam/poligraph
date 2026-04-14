import { AlertTriangle } from "lucide-react";

export function CondamnationsPresumptionBanner() {
  return (
    <aside
      role="note"
      aria-labelledby="presumption-banner-title"
      className="my-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <div className="flex gap-3">
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <div>
          <h3
            id="presumption-banner-title"
            className="font-semibold text-amber-900 dark:text-amber-200 mb-1"
          >
            Décisions non définitives
          </h3>
          <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
            Les condamnations présentées ci-dessous ont été prononcées en première instance ou en
            appel. Elles ne sont pas définitives : la présomption d{"'"}innocence s{"'"}applique
            tant que les voies de recours ne sont pas épuisées.
          </p>
        </div>
      </div>
    </aside>
  );
}
