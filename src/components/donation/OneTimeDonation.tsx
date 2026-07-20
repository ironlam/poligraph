"use client";

import { DONATION_PREFILL_MODE, ONE_TIME_AMOUNTS } from "@/config/donation";
import { useDonationDialog } from "./DonationDialogProvider";

export function OneTimeDonation() {
  const { open } = useDonationDialog();
  const prefill = DONATION_PREFILL_MODE === "verified";

  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="mb-3">
        <strong className="font-display">Un seul geste, du montant de votre choix.</strong>
      </p>
      {prefill ? (
        <div className="flex flex-wrap gap-2">
          {ONE_TIME_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => open("one-time")}
              aria-label={`Donner ${amount} €`}
              className="rounded-full border bg-muted px-4 py-2 font-display font-semibold hover:bg-accent"
            >
              {amount}€
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => open("one-time")}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Choisir mon montant sur le formulaire sécurisé
        </button>
      )}
    </div>
  );
}
