"use client";

import { buildDonationWidgetUrl, HELLOASSO_FORM_URL } from "@/config/donation";
import { trackUmami } from "@/lib/umami";
import { HelloAssoFormFrame } from "./HelloAssoFormFrame";

export function HelloAssoInlineForm() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="mb-1 font-display font-bold">Faire mon don</p>
      <p className="mb-4 text-sm text-muted-foreground">
        Choisissez le montant et la fréquence (mensuel ou ponctuel) dans le formulaire sécurisé. Il
        n&apos;est chargé qu&apos;après votre clic, vous restez sur la page.
      </p>
      <HelloAssoFormFrame
        src={buildDonationWidgetUrl()}
        title="Formulaire de don HelloAsso (inline)"
        fallbackUrl={HELLOASSO_FORM_URL}
        requireClick
        onActivate={() => trackUmami("donation_inline_load", { source: "support-page" })}
      />
    </div>
  );
}
