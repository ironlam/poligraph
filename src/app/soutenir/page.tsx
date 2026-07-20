import { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportPageDonation } from "@/components/donation/SupportPageDonation";
import { SecondaryPlatforms } from "@/components/donation/SecondaryPlatforms";
import { MISSION_ITEMS, taxReceiptMessage, totalMonthlyEuros } from "@/config/donation";

export const metadata: Metadata = {
  title: "Soutenez Poligraph",
  description:
    "Aidez l'association Sankofa à maintenir et développer cette plateforme citoyenne d'information politique.",
  alternates: { canonical: "/soutenir" },
};

export default function SoutenirPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-12 text-center">
        <p className="mb-2 font-display text-xs font-bold uppercase tracking-widest text-brand">
          Association Sankofa · loi 1901
        </p>
        <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight">
          Soutenez Poligraph
        </h1>
        <p className="text-lg text-muted-foreground">
          Un projet citoyen indépendant. Votre soutien finance les outils indispensables,
          l&apos;infrastructure et, lorsque cela est nécessaire, des prestations spécialisées pour
          accélérer la feuille de route. Le développement principal reste aujourd&apos;hui bénévole.
        </p>
      </div>

      <SupportPageDonation />

      <section className="mt-12">
        <h2 className="mb-1 text-2xl font-bold">À quoi sert votre don</h2>
        <p className="mb-6 text-muted-foreground">
          Poligraph tourne d&apos;abord sur du temps. Vos dons permettent d&apos;en dégager plus.
        </p>
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
          {MISSION_ITEMS.map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-lg border bg-card p-4">
              <span className="mt-0.5 font-bold text-brand" aria-hidden="true">
                ✓
              </span>
              <span className="text-sm">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Vos dons couvrent aussi les frais techniques du service (hébergement, IA, base de
          données), environ {totalMonthlyEuros()}€/mois. Toujours sans publicité.
        </p>
        <p className="mt-4 border-l-[3px] border-brand pl-4">
          <strong>Notre objectif :</strong> sécuriser un socle de dons mensuels pour couvrir nos
          frais et faire avancer la feuille de route, sans jamais dépendre de la publicité.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="mb-1 text-2xl font-bold">Autres façons de soutenir financièrement</h2>
        <p className="mb-6 text-muted-foreground">
          HelloAsso reste notre canal principal (don à l&apos;association). {taxReceiptMessage()}
        </p>
        <SecondaryPlatforms />
      </section>

      <section className="mt-12">
        <h2 className="mb-6 text-2xl font-bold">Aider autrement</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Partagez le projet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Parlez de Poligraph autour de vous et sur les réseaux. Plus nous sommes nombreux,
                plus notre voix porte.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Contribuez au code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Le projet est open source. Vos contributions sont les bienvenues sur{" "}
                <a
                  href="https://github.com/ironlam/poligraph"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                  <span className="sr-only"> (ouvre un nouvel onglet)</span>
                </a>
                .
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Signalez une erreur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Une donnée obsolète, une coquille ? Contactez-nous via les{" "}
                <Link href="/mentions-legales" className="text-primary hover:underline">
                  mentions légales
                </Link>
                . Chaque correction améliore le projet.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Utilisez l&apos;API</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Journalistes, chercheurs, développeurs : notre{" "}
                <Link href="/docs/api" className="text-primary hover:underline">
                  API ouverte
                </Link>{" "}
                donne accès à toutes nos données.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-12">
        <Card className="bg-muted">
          <CardContent className="pt-6 text-center">
            <h2 className="mb-2 text-xl font-bold">Merci</h2>
            <p className="text-muted-foreground">
              Que vous nous souteniez financièrement ou autrement, merci de croire en ce projet
              citoyen. Ensemble, rendons la politique plus lisible.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
