"use client";

import { DONATION_PREFILL_MODE, MONTHLY_TIERS } from "@/config/donation";
import { cn } from "@/lib/utils";
import { useDonationDialog } from "./DonationDialogProvider";

export function DonationTiers() {
  const { open } = useDonationDialog();
  const prefill = DONATION_PREFILL_MODE === "verified";

  return (
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
          <p className="flex-1 text-sm text-muted-foreground">{tier.impactLabel}</p>
          <button
            type="button"
            onClick={() => open("monthly")}
            aria-label={
              prefill
                ? `Soutenir ${tier.monthlyEuros} € par mois`
                : "Choisir mon montant sur le formulaire sécurisé"
            }
            className={cn(
              "rounded-full px-4 py-2 font-display text-sm font-semibold",
              tier.recommended
                ? "bg-brand text-brand-foreground"
                : "border bg-muted text-foreground hover:bg-accent"
            )}
          >
            {prefill ? "Je soutiens" : "Choisir mon montant"}
          </button>
        </div>
      ))}
    </div>
  );
}
