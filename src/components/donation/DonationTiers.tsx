import { MONTHLY_TIERS } from "@/config/donation";

// Monthly amounts are an impact scale, not a pricing grid: HelloAsso cannot
// pre-select an amount for a recurring donation, so the embedded form is the
// single call to action. No tier is singled out as "recommended".
export function DonationTiers() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {MONTHLY_TIERS.map((tier) => (
        <div key={tier.monthlyEuros} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="font-display text-2xl font-extrabold">
            {tier.monthlyEuros}€
            <span className="text-sm font-semibold text-muted-foreground">/mois</span>
          </div>
          <p className="text-sm text-muted-foreground">{tier.impactLabel}</p>
        </div>
      ))}
    </div>
  );
}
