"use client";

import Link from "next/link";
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
      <div className="mt-8 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => open("monthly")}
          className="w-full rounded-full bg-brand px-10 py-4 font-display text-lg font-bold text-brand-foreground hover:opacity-90 sm:w-auto"
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
