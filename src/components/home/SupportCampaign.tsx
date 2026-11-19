"use client";

import Link from "next/link";
import {
  DonationDialogProvider,
  useDonationDialog,
} from "@/components/donation/DonationDialogProvider";

function CampaignInner() {
  const { open } = useDonationDialog();
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-primary/70 bg-primary p-5 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-extrabold leading-tight md:text-xl">
          Un observatoire citoyen, financé par ses lecteurs
        </h2>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Indépendant et sans publicité.{" "}
          <Link href="/soutenir" className="underline underline-offset-4 hover:no-underline">
            Don ponctuel ou autres plateformes
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => open("monthly")}
        className="min-h-11 shrink-0 rounded-full bg-brand px-8 font-display text-base font-bold text-brand-foreground hover:opacity-90"
      >
        Je soutiens
      </button>
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
