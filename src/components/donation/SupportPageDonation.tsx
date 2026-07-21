import { DonationTiers } from "./DonationTiers";
import { HelloAssoInlineForm } from "./HelloAssoInlineForm";

export function SupportPageDonation() {
  return (
    <>
      <section>
        <h2 className="mb-1 text-2xl font-bold">Devenez soutien mensuel</h2>
        <p className="mb-6 text-muted-foreground">
          Le don régulier est ce qui nous aide le plus. Annulable à tout moment.
        </p>
        <DonationTiers />
      </section>

      <section className="mt-12">
        <HelloAssoInlineForm />
      </section>
    </>
  );
}
