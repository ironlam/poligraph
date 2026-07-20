"use client";

import { MONTHLY_TIERS } from "@/config/donation";
import { cn } from "@/lib/utils";
import { useDonationDialog } from "./DonationDialogProvider";

// Monthly amounts are an impact scale, not a control surface: HelloAsso cannot
// pre-select an amount for a recurring donation, so a single CTA opens the form
// where the donor picks amount and frequency. Avoids a misleading pricing-grid.
export function DonationTiers() {
  const { open } = useDonationDialog();

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {MONTHLY_TIERS.map((tier) => (
          <div
            key={tier.monthlyEuros}
            className={cn(
              "relative flex flex-col gap-2 rounded-xl border bg-card p-4",
              tier.recommended && "border-2 border-brand"
            )}
          >
            {tier.recommended && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand px-2 py-0.5 font-display text-[0.62rem] font-bold uppercase tracking-wide text-brand-foreground">
                Recommandé
              </span>
            )}
            <div className="font-display text-2xl font-extrabold">
              {tier.monthlyEuros}€
              <span className="text-sm font-semibold text-muted-foreground">/mois</span>
            </div>
            <p className="text-sm text-muted-foreground">{tier.impactLabel}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => open("monthly")}
          className="rounded-full bg-brand px-8 py-3 font-display text-base font-semibold text-brand-foreground hover:opacity-90"
        >
          Je soutiens
        </button>
        <p className="text-xs text-muted-foreground">
          Vous choisissez le montant et la fréquence dans le formulaire sécurisé.
        </p>
      </div>
    </div>
  );
}
