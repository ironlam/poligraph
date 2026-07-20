"use client";

import { DonationDialogProvider } from "./DonationDialogProvider";
import { DonationTiers } from "./DonationTiers";
import { OneTimeDonation } from "./OneTimeDonation";
import { HelloAssoInlineForm } from "./HelloAssoInlineForm";

export function SupportPageDonation() {
  return (
    <DonationDialogProvider source="support-page">
      <section>
        <h2 className="mb-1 text-2xl font-bold">Devenez soutien mensuel</h2>
        <p className="mb-6 text-muted-foreground">
          Le don régulier est ce qui nous aide le plus. Annulable à tout moment.
        </p>
        <DonationTiers />
      </section>

      <section className="mt-12">
        <h2 className="mb-1 text-2xl font-bold">Plutôt un don ponctuel ?</h2>
        <p className="mb-6 text-muted-foreground">Un seul geste, du montant que vous voulez.</p>
        <OneTimeDonation />
      </section>

      <section className="mt-8">
        <HelloAssoInlineForm />
      </section>
    </DonationDialogProvider>
  );
}
