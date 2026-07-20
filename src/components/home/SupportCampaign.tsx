"use client";

import Link from "next/link";
import { MONTHLY_TIERS } from "@/config/donation";
import { cn } from "@/lib/utils";
import {
  DonationDialogProvider,
  useDonationDialog,
} from "@/components/donation/DonationDialogProvider";

function CampaignInner() {
  const { open } = useDonationDialog();
  return (
    <section className="overflow-hidden rounded-2xl border border-primary/70 bg-primary p-8 text-primary-foreground">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-primary-foreground/90">
        Soutenir Poligraph
      </p>
      <h2 className="mt-2 font-display text-2xl font-extrabold md:text-3xl">
        Un observatoire citoyen, financé par ses lecteurs
      </h2>
      <p className="mt-2 max-w-2xl text-primary-foreground/80">
        Indépendant et sans publicité. Vos dons mensuels nous aident à tenir les données à jour et à
        faire avancer le projet.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {MONTHLY_TIERS.map((tier) => (
          <div
            key={tier.monthlyEuros}
            className={cn(
              "min-w-[4.5rem] flex-1 rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-3 text-center",
              tier.recommended && "border-transparent bg-brand text-brand-foreground"
            )}
          >
            <span className="block font-display text-xl font-extrabold">{tier.monthlyEuros}€</span>
            <span className="text-xs opacity-80">/mois</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => open("monthly")}
          className="rounded-full bg-brand px-6 py-2.5 font-display font-semibold text-brand-foreground hover:opacity-90"
        >
          Je soutiens
        </button>
        <Link href="/soutenir" className="text-sm text-primary-foreground/85 hover:underline">
          Don ponctuel ou autres plateformes →
        </Link>
      </div>
    </section>
  );
}

export function SupportCampaign() {
  return (
    <DonationDialogProvider source="homepage">
      <CampaignInner />
    </DonationDialogProvider>
  );
}
