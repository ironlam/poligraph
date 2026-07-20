"use client";

import { buildDonationWidgetUrl, SUPPORT_PLATFORMS } from "@/config/donation";
import { trackUmami } from "@/lib/umami";
import { HelloAssoFormFrame } from "./HelloAssoFormFrame";

const HELLOASSO_FORM_URL = SUPPORT_PLATFORMS.find((p) => p.id === "helloasso")!.url!;

export function HelloAssoInlineForm() {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="mb-1 font-display font-bold">Faire mon don ici, sans quitter la page</p>
      <p className="mb-4 text-sm text-muted-foreground">
        Le formulaire HelloAsso n&apos;est chargé qu&apos;après votre action.
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
