import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Traitements de données liés au site, à la newsletter, aux dons, à l'API et au serveur MCP PoliGraph.",
  alternates: { canonical: "/confidentialite" },
};

export default function ConfidentialitePage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight">
        Politique de confidentialité
      </h1>
      <p className="mb-10 text-muted-foreground">
        Cette page décrit les traitements de données associés aux services PoliGraph. Elle ne
        remplace ni les conditions d&apos;utilisation ni les mentions légales.
      </p>

      <div className="prose prose-gray max-w-none space-y-10">
        <section>
          <h2 className="mb-4 text-xl font-semibold">Responsable du traitement</h2>
          <p className="text-muted-foreground">
            <strong>Association Sankofa</strong>, association loi 1901, RNA W931031256
            <br />
            93800 Épinay-sur-Seine, France
            <br />
            <a href="mailto:contact@poligraph.fr" className="underline">
              contact@poligraph.fr
            </a>
          </p>
          <p className="mt-3 text-muted-foreground">
            Aucun délégué à la protection des données distinct n&apos;est actuellement déclaré. Les
            demandes relatives aux données personnelles sont reçues à l&apos;adresse ci-dessus.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Services couverts</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>le site principal poligraph.fr et ses pages publiques ;</li>
            <li>la newsletter PoliGraph, sur inscription volontaire ;</li>
            <li>les dons ouverts volontairement auprès de HelloAsso ;</li>
            <li>l&apos;API publique de poligraph.fr ;</li>
            <li>la page d&apos;accueil statique de mcp.poligraph.fr ;</li>
            <li>le serveur MCP disponible sur mcp.poligraph.fr ;</li>
            <li>
              les connecteurs utilisés depuis Claude, ChatGPT ou un autre client compatible MCP ;
            </li>
            <li>les demandes de support envoyées par email.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Serveur MCP et connecteurs</h2>
          <p className="rounded-lg border bg-muted/30 p-4 text-center font-medium">
            Client Claude, ChatGPT ou autre client MCP → mcp.poligraph.fr → API publique
            poligraph.fr
          </p>
          <div className="mt-4 space-y-3 text-muted-foreground">
            <p>
              Le serveur MCP ne demande aucun compte PoliGraph et n&apos;utilise aucune
              authentification dans son état actuel. Sa page d&apos;accueil est statique et
              n&apos;utilise ni cookie ni outil de mesure d&apos;audience.
            </p>
            <p>
              Les requêtes et les paramètres nécessaires sont traités transitoirement afin
              d&apos;interroger l&apos;API publique et de répondre au client. Le serveur MCP ne
              prévoit aucune conservation applicative dédiée du contenu de ces requêtes. Son handler
              ne copie pas les arguments des tools dans les logs applicatifs.
            </p>
            <p>Les métadonnées applicatives journalisées sont limitées à :</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>le timestamp ;</li>
              <li>la méthode HTTP ;</li>
              <li>la méthode JSON-RPC ;</li>
              <li>l&apos;identifiant JSON-RPC ;</li>
              <li>le User-Agent ;</li>
              <li>l&apos;en-tête Accept.</li>
            </ul>
            <p>
              L&apos;hébergeur peut traiter les données techniques nécessaires à l&apos;acheminement
              et à la sécurité de la requête, notamment une adresse IP. Ces données relèvent aussi
              des systèmes et politiques de l&apos;hébergeur.
            </p>
            <p>
              PoliGraph n&apos;utilise pas les requêtes MCP pour établir un profil politique de
              l&apos;utilisateur. Elles ne sont ni revendues, ni utilisées à des fins publicitaires,
              ni déclarées comme données d&apos;entraînement d&apos;un modèle par PoliGraph.
            </p>
            <p>
              L&apos;utilisation de Claude, ChatGPT ou d&apos;un autre client reste également régie
              par les conditions et la politique de confidentialité de la plateforme choisie. Cette
              page ne décrit pas les traitements réalisés par ces plateformes.
            </p>
          </div>
        </section>

        <section id="newsletter">
          <h2 className="mb-4 text-xl font-semibold">Newsletter</h2>
          <div className="space-y-3 text-muted-foreground">
            <p>
              L&apos;inscription repose sur le consentement. L&apos;adresse email est obligatoire.
              Le code postal, l&apos;identifiant du député de la circonscription et le profil de
              concordance issu de la boussole parlementaire sont facultatifs. Les réponses au quiz
              utilisées pour ce profil sont anonymisées.
            </p>
            <p>
              Ces informations servent à envoyer la newsletter hebdomadaire et, lorsque les champs
              facultatifs sont renseignés, à personnaliser son contenu avec les votes du député et
              le profil de concordance. Elles ne font l&apos;objet d&apos;aucun usage commercial,
              d&apos;aucune revente ni d&apos;aucun partage avec des tiers commerciaux.
            </p>
            <p>
              Mailjet assure l&apos;envoi, Vercel l&apos;hébergement du service et Supabase le
              stockage applicatif associé. L&apos;adresse email est traitée par ces services dans la
              mesure nécessaire à leur rôle.
            </p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Don en ligne</h2>
          <p className="text-muted-foreground">
            Le formulaire HelloAsso est chargé uniquement lorsque l&apos;utilisateur choisit de
            l&apos;ouvrir. HelloAsso traite alors les données nécessaires au paiement et à
            l&apos;émission du don selon ses propres conditions. Les obligations administratives et
            comptables applicables à l&apos;Association Sankofa restent prises en compte.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Finalités et bases légales</h2>
          <ul className="list-disc space-y-3 pl-6 text-muted-foreground">
            <li>
              <strong>Fournir et sécuriser le site, l&apos;API et le serveur MCP :</strong> intérêt
              légitime de l&apos;association à proposer et maintenir le service.
            </li>
            <li>
              <strong>Diagnostiquer les erreurs et prévenir les abus :</strong> intérêt légitime lié
              à la sécurité et à la disponibilité du service.
            </li>
            <li>
              <strong>
                Répondre aux demandes de support, de rectification et de droit de réponse :
              </strong>{" "}
              traitement de la demande et intérêt légitime de l&apos;association.
            </li>
            <li>
              <strong>Newsletter :</strong> consentement de la personne inscrite.
            </li>
            <li>
              <strong>Don :</strong> traitement nécessaire à la demande de l&apos;utilisateur et
              respect des obligations administratives applicables.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Destinataires et prestataires</h2>
          <ul className="list-disc space-y-3 pl-6 text-muted-foreground">
            <li>
              <strong>Vercel :</strong> hébergement, acheminement et logs techniques du site et du
              serveur MCP.
            </li>
            <li>
              <strong>Supabase :</strong> base de données du site principal et de l&apos;API
              publique. Le serveur MCP ne se connecte pas directement à cette base.
            </li>
            <li>
              <strong>Umami :</strong> mesure d&apos;audience sans cookie sur le site principal, pas
              sur la page d&apos;accueil MCP.
            </li>
            <li>
              <strong>Mailjet :</strong> inscription et envoi de la newsletter.
            </li>
            <li>
              <strong>HelloAsso :</strong> traitement du don lorsqu&apos;un utilisateur choisit
              d&apos;ouvrir le formulaire correspondant.
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            Chaque prestataire intervient uniquement pour les services qui le concernent. Cette
            liste ne signifie pas que chacun reçoit toutes les catégories de données.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Conservation</h2>
          <ul className="list-disc space-y-3 pl-6 text-muted-foreground">
            <li>
              <strong>Contenu des requêtes MCP :</strong> aucune conservation applicative dédiée par
              le serveur MCP.
            </li>
            <li>
              <strong>Logs techniques :</strong> conservation selon l&apos;offre Vercel active et
              ses options. Les durées publiées par Vercel vont actuellement d&apos;une heure à
              trente jours selon l&apos;offre et les options. PoliGraph ne présente pas ici
              d&apos;offre particulière comme étant celle actuellement active.
            </li>
            <li>
              <strong>Support :</strong> pendant le temps nécessaire au traitement de la demande,
              puis selon les obligations applicables ou le besoin de conserver une preuve utile.
            </li>
            <li>
              <strong>Newsletter :</strong> jusqu&apos;au désabonnement, avec suppression
              automatique après douze newsletters consécutives sans ouverture.
            </li>
            <li>
              <strong>Dons :</strong> selon les règles de HelloAsso et les obligations comptables
              applicables à l&apos;association.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Transferts hors Union européenne</h2>
          <p className="text-muted-foreground">
            Les informations publiques actuelles mentionnent notamment Vercel aux États-Unis et une
            infrastructure Supabase à Singapour. Certains services peuvent donc impliquer des
            traitements hors de l&apos;Union européenne selon leur configuration et leurs propres
            garanties contractuelles. PoliGraph ne garantit pas une localisation exclusivement
            européenne de tous les traitements.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">Vos droits</h2>
          <p className="text-muted-foreground">
            Selon le traitement et lorsque le droit concerné est applicable, vous pouvez demander
            l&apos;accès, la rectification, l&apos;effacement, la limitation ou vous opposer au
            traitement. Le consentement à la newsletter peut être retiré à tout moment, notamment
            par le lien de désabonnement présent dans chaque email.
          </p>
          <p className="mt-3 text-muted-foreground">
            Écrivez à{" "}
            <a href="mailto:contact@poligraph.fr" className="font-semibold underline">
              contact@poligraph.fr
            </a>
            . Vous pouvez également saisir la{" "}
            <a
              href="https://www.cnil.fr"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              CNIL
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Données publiques sur les responsables politiques
          </h2>
          <p className="text-muted-foreground">
            PoliGraph publie des données issues de sources publiques dans un objectif
            d&apos;information citoyenne. La provenance et les règles éditoriales sont présentées
            dans les pages{" "}
            <Link href="/sources" className="underline">
              Sources
            </Link>
            ,{" "}
            <Link href="/methodologie" className="underline">
              Méthodologie
            </Link>{" "}
            et{" "}
            <Link href="/mentions-legales" className="underline">
              Mentions légales
            </Link>
            .
          </p>
        </section>
      </div>

      <p className="mt-12 text-sm text-muted-foreground">Dernière mise à jour : Août 2026</p>
    </main>
  );
}
