import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Informations légales relatives à l'édition et à l'hébergement de PoliGraph.",
  alternates: { canonical: "/mentions-legales" },
};

export default function MentionsLegalesPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 font-display text-3xl font-extrabold tracking-tight">Mentions légales</h1>

      <div className="prose prose-gray max-w-none space-y-8">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Éditeur du site</h2>
          <p className="text-muted-foreground">
            <strong>Nom / Raison sociale :</strong> Association Sankofa (loi 1901, RNA W931031256)
            <br />
            <strong>Adresse :</strong> 93800 Épinay-sur-Seine, France
            <br />
            <strong>Email :</strong>{" "}
            <a href="mailto:contact@poligraph.fr" className="underline">
              contact@poligraph.fr
            </a>
            <br />
            <strong>Directeur de la publication :</strong> Lamine Diaby
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Hébergement</h2>
          <p className="text-muted-foreground">
            Vercel Inc.
            <br />
            440 N Barranca Ave #4133, Covina, CA 91723, États-Unis
            <br />
            <a
              href="https://vercel.com"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              vercel.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Sources des données</h2>
          <p className="text-muted-foreground">
            Les informations publiées proviennent de sources publiques, institutionnelles ou
            journalistiques citées, notamment l&apos;Assemblée nationale, le Sénat, le Gouvernement,
            le Parlement européen, la HATVP, le Répertoire national des élus, Wikidata, Judilibre et
            des organismes de fact-checking. Les articles de presse utilisés comme sources sont
            référencés avec les informations concernées.
          </p>
          <p className="mt-3 text-muted-foreground">
            La liste détaillée et les principes de sélection sont disponibles sur la page{" "}
            <Link href="/sources" className="underline">
              Sources et principes
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Présomption d&apos;innocence</h2>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-amber-900">
              <strong>Important :</strong> conformément à l&apos;article 9-1 du Code civil, toute
              personne mentionnée dans le cadre d&apos;une procédure judiciaire en cours bénéficie
              de la présomption d&apos;innocence.
            </p>
            <p className="mt-2 text-amber-900">
              Seules les condamnations définitives, après épuisement des voies de recours,
              établissent la culpabilité d&apos;une personne.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Droit de réponse et rectification</h2>
          <p className="text-muted-foreground">
            Conformément à la loi du 29 juillet 1881 sur la liberté de la presse, toute personne
            nommée ou désignée sur ce site dispose d&apos;un droit de réponse.
          </p>
          <p className="mt-2 text-muted-foreground">
            Pour exercer ce droit ou signaler une erreur factuelle, écrivez à{" "}
            <a href="mailto:contact@poligraph.fr" className="font-semibold underline">
              contact@poligraph.fr
            </a>
            .
          </p>
          <p className="mt-2 text-muted-foreground">
            Nous nous engageons à traiter les demandes de droit de réponse et de rectification dans
            un délai de 72 heures ouvrées. Cet engagement ne s&apos;étend pas aux autres demandes de
            support.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Propriété intellectuelle</h2>
          <p className="text-muted-foreground">
            Les données factuelles présentées sont issues de sources publiques et restent soumises
            aux licences et conditions de leurs sources. Les textes éditoriaux et les contenus tiers
            peuvent relever de régimes distincts.
          </p>
          <p className="mt-2 text-muted-foreground">
            Le code source du site est disponible sous{" "}
            <a
              href="https://github.com/ironlam/poligraph/blob/main/LICENSE"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              licence AGPL-3.0
            </a>
            . Une{" "}
            <Link href="/docs/api" className="underline">
              API publique
            </Link>{" "}
            permet la consultation et la réutilisation des données selon les règles applicables.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Confidentialité, conditions et support</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>
              <Link href="/confidentialite" className="underline">
                Politique de confidentialité
              </Link>
            </li>
            <li>
              <Link href="/conditions-utilisation" className="underline">
                Conditions d&apos;utilisation
              </Link>
            </li>
            <li>
              <Link href="/support" className="underline">
                Support et signalements
              </Link>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Contact</h2>
          <p className="text-muted-foreground">
            Pour toute question concernant ce site :{" "}
            <a href="mailto:contact@poligraph.fr" className="font-semibold underline">
              contact@poligraph.fr
            </a>
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">Dernière mise à jour : Août 2026</p>
    </main>
  );
}
