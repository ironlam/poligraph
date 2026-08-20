import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description:
    "Conditions applicables au site, à l'API publique, à la documentation et au serveur MCP PoliGraph.",
  alternates: { canonical: "/conditions-utilisation" },
};

export default function ConditionsUtilisationPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight">
        Conditions d&apos;utilisation
      </h1>
      <p className="mb-10 text-muted-foreground">
        Ces conditions encadrent l&apos;utilisation du site, de l&apos;API publique, du serveur MCP,
        de sa documentation et de sa page d&apos;accueil.
      </p>

      <div className="prose prose-gray max-w-none space-y-10">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Objet du service</h2>
          <p className="text-muted-foreground">
            PoliGraph est un observatoire citoyen de la vie politique française. Il rassemble des
            données publiques et documentées afin de faciliter leur consultation. Les outils MCP
            sont en lecture seule. Le service est gratuit et sans compte dans son état actuel.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Acceptation</h2>
          <p className="text-muted-foreground">
            L&apos;utilisation d&apos;un service PoliGraph implique l&apos;acceptation des présentes
            conditions dans leur version applicable au moment de l&apos;utilisation. Aucun mécanisme
            de consentement par case à cocher n&apos;est mis en place pour la simple consultation.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Usages permis</h2>
          <p className="text-muted-foreground">Le service peut notamment être utilisé pour :</p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
            <li>la consultation et la recherche ;</li>
            <li>le journalisme et la vérification de faits ;</li>
            <li>l&apos;enseignement et la recherche académique ;</li>
            <li>l&apos;analyse citoyenne de la vie publique ;</li>
            <li>la réutilisation conforme aux licences et aux sources applicables.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Usages interdits</h2>
          <p className="text-muted-foreground">Il est interdit de :</p>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
            <li>contourner les mesures de sécurité ou les limites techniques du service ;</li>
            <li>surcharger intentionnellement le site, l&apos;API ou le serveur MCP ;</li>
            <li>tenter d&apos;accéder aux interfaces privées ou administratives ;</li>
            <li>
              réutiliser les données de façon trompeuse ou supprimer volontairement leur contexte ;
            </li>
            <li>présenter une procédure en cours comme la preuve d&apos;une culpabilité ;</li>
            <li>
              harceler ou cibler abusivement une personne à partir des informations consultées ;
            </li>
            <li>
              construire ou diffuser une publicité politique ciblée à partir de données personnelles
              obtenues grâce au service ;
            </li>
            <li>publier un PoC relatif à une vulnérabilité non corrigée dans un espace public.</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Ces règles s&apos;appliquent de façon identique, sans considération partisane.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Limites des données</h2>
          <div className="space-y-3 text-muted-foreground">
            <p>
              Les données peuvent être incomplètes ou mises à jour progressivement. L&apos;absence
              d&apos;une information ne possède aucune signification implicite. Les sources
              originales doivent être consultées avant toute réutilisation importante.
            </p>
            <p>
              PoliGraph ne fournit aucun conseil juridique et ne constitue pas une source judiciaire
              officielle. Une mention, un rôle dans une affaire, un statut procédural et une
              décision de justice sont des notions distinctes.
            </p>
            <p>
              Toute personne concernée par une procédure en cours bénéficie de la présomption
              d&apos;innocence. Les principes de présentation sont détaillés dans la{" "}
              <Link href="/methodologie" className="underline">
                méthodologie
              </Link>{" "}
              et la liste des sources figure sur la page{" "}
              <Link href="/sources" className="underline">
                Sources
              </Link>
              .
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Disponibilité</h2>
          <p className="text-muted-foreground">
            Le service est fourni avec une obligation de moyens. Des interruptions, maintenances ou
            évolutions peuvent survenir. Aucune disponibilité permanente ni aucun niveau de service
            contractuel ne sont garantis.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Plateformes tierces</h2>
          <p className="text-muted-foreground">
            Claude, ChatGPT et les autres clients MCP appliquent leurs propres conditions
            d&apos;utilisation et politiques de confidentialité. PoliGraph ne décrit pas ici les
            traitements ou engagements de ces plateformes.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Propriété intellectuelle et réutilisation</h2>
          <ul className="list-disc space-y-3 pl-6 text-muted-foreground">
            <li>le code du site est publié sous la licence indiquée dans son dépôt ;</li>
            <li>le code du serveur MCP possède sa propre licence dans son dépôt distinct ;</li>
            <li>les textes éditoriaux restent soumis à leurs conditions de réutilisation ;</li>
            <li>
              les données factuelles dépendent des licences ouvertes et des règles attachées à leurs
              sources ;
            </li>
            <li>les contenus provenant de tiers restent soumis aux droits de leurs auteurs.</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Une même licence ne s&apos;applique donc pas automatiquement à toutes ces catégories.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Responsabilité</h2>
          <p className="text-muted-foreground">
            La vérification des sources originales est recommandée. Chaque utilisateur reste
            responsable du contexte, de la licéité et de l&apos;exactitude de sa réutilisation. Les
            limites de responsabilité applicables dépendent du droit en vigueur et des
            circonstances. Cette page ne crée aucune exclusion générale ou absolue.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Droit applicable</h2>
          <p className="text-muted-foreground">
            Les présentes conditions sont régies par le droit français, sous réserve des règles
            impératives éventuellement applicables.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Contact et modifications</h2>
          <p className="text-muted-foreground">
            Ces conditions peuvent évoluer avec le service. Pour une question ou un signalement,
            consultez le{" "}
            <Link href="/support" className="underline">
              support
            </Link>
            , la{" "}
            <Link href="/confidentialite" className="underline">
              politique de confidentialité
            </Link>{" "}
            et les{" "}
            <Link href="/mentions-legales" className="underline">
              mentions légales
            </Link>
            .
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">Dernière mise à jour : Août 2026</p>
    </main>
  );
}
