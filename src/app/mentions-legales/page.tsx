import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales et politique de confidentialité",
  alternates: { canonical: "/mentions-legales" },
};

export default function MentionsLegalesPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-8">Mentions légales</h1>

      <div className="prose prose-gray max-w-none space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4">Éditeur du site</h2>
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
          <h2 className="text-xl font-semibold mb-4">Hébergement</h2>
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
          <h2 className="text-xl font-semibold mb-4">Sources des données</h2>
          <p className="text-muted-foreground mb-4">
            Les informations publiées sur ce site proviennent exclusivement de sources publiques :
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>
              Assemblée nationale (
              <a
                href="https://data.assemblee-nationale.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                data.assemblee-nationale.fr
              </a>
              )
            </li>
            <li>
              Sénat (
              <a
                href="https://data.senat.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                data.senat.fr
              </a>
              )
            </li>
            <li>
              Gouvernement (
              <a
                href="https://www.gouvernement.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                gouvernement.fr
              </a>
              ) : données ministérielles
            </li>
            <li>
              Parlement européen (
              <a
                href="https://www.europarl.europa.eu"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                europarl.europa.eu
              </a>
              ) : mandats européens
            </li>
            <li>
              Haute Autorité pour la Transparence de la Vie Publique (
              <a
                href="https://www.hatvp.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                hatvp.fr
              </a>
              )
            </li>
            <li>
              Wikidata (
              <a
                href="https://www.wikidata.org"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                wikidata.org
              </a>
              ) : données biographiques, photos, identifiants
            </li>
            <li>
              NosDéputés / NosSénateurs (
              <a
                href="https://www.nosdeputes.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                nosdeputes.fr
              </a>
              {" / "}
              <a
                href="https://www.nossenateurs.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                nossenateurs.fr
              </a>
              ) : activité parlementaire
            </li>
            <li>
              Répertoire National des Élus (
              <a
                href="https://www.data.gouv.fr/fr/datasets/repertoire-national-des-elus-1/"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                data.gouv.fr
              </a>
              ) : maires et élus locaux
            </li>
            <li>
              Judilibre (
              <a
                href="https://www.courdecassation.fr/acces-rapide-judilibre"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                courdecassation.fr
              </a>
              ) : décisions de justice publiées
            </li>
            <li>Google Fact Check Tools API : vérification des faits (fact-checking)</li>
            <li>Articles de presse (sources citées pour chaque information)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Présomption d&apos;innocence</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-amber-900">
              <strong>Important :</strong> Conformément à l&apos;article 9-1 du Code civil, toute
              personne mentionnée sur ce site dans le cadre d&apos;une procédure judiciaire en cours
              (enquête préliminaire, instruction, mise en examen, procès) bénéficie de la
              présomption d&apos;innocence.
            </p>
            <p className="text-amber-900 mt-2">
              Seules les condamnations définitives (après épuisement des voies de recours)
              établissent la culpabilité d&apos;une personne.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Droit de réponse et rectification</h2>
          <p className="text-muted-foreground">
            Conformément à la loi du 29 juillet 1881 sur la liberté de la presse, toute personne
            nommée ou désignée sur ce site dispose d&apos;un droit de réponse.
          </p>
          <p className="text-muted-foreground mt-2">
            Pour exercer ce droit ou signaler une erreur factuelle, veuillez nous contacter à
            l&apos;adresse :{" "}
            <a href="mailto:contact@poligraph.fr" className="underline font-semibold">
              contact@poligraph.fr
            </a>
          </p>
          <p className="text-muted-foreground mt-2">
            Nous nous engageons à traiter toute demande dans un délai de 72 heures ouvrées.
          </p>
        </section>

        <section id="newsletter">
          <h2 className="text-xl font-semibold mb-4">Newsletter et données personnelles</h2>
          <div className="text-muted-foreground space-y-3">
            <p>
              <strong>Base légale :</strong> consentement explicite (article 6.1.a du RGPD),
              recueilli au moment de l&apos;inscription au formulaire de la newsletter.
            </p>
            <p>
              <strong>Données collectées :</strong> adresse email obligatoire ; et de façon
              optionnelle : code postal, identifiant du député de votre circonscription, profil de
              concordance issu de la boussole parlementaire (réponses anonymisées aux questions du
              quiz). Aucune donnée nominative autre que votre email n&apos;est conservée.
            </p>
            <p>
              <strong>Finalité :</strong> envoi de la newsletter hebdomadaire et personnalisation de
              son contenu (récap des votes de votre député, concordance avec votre profil). Aucun
              usage commercial, aucune revente, aucun partage avec des tiers commerciaux.
            </p>
            <p>
              <strong>Sous-traitants :</strong> Mailjet (Mailgun Sàrl, Paris, France) pour
              l&apos;envoi des emails ; Vercel (États-Unis) pour l&apos;hébergement ; Supabase
              (Singapour) pour la base de données. Une copie de votre email est stockée chez chacun
              de ces prestataires.
            </p>
            <p>
              <strong>Durée de conservation :</strong> jusqu&apos;à votre désabonnement. Suppression
              automatique après 12 newsletters consécutives sans ouverture.
            </p>
            <p>
              <strong>Vos droits :</strong> accès, rectification, effacement, portabilité,
              opposition, retrait du consentement à tout moment. Le lien de désabonnement est
              présent en bas de chaque email envoyé. Vous pouvez aussi nous écrire à{" "}
              <a href="mailto:contact@poligraph.fr" className="underline font-semibold">
                contact@poligraph.fr
              </a>
              .
            </p>
            <p>
              <strong>Réclamation :</strong> si vous estimez que vos droits ne sont pas respectés,
              vous pouvez saisir la{" "}
              <a
                href="https://www.cnil.fr"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                CNIL
              </a>
              .
            </p>
          </div>
        </section>

        <section id="don">
          <h2 className="text-xl font-semibold mb-4">Don en ligne</h2>
          <p className="text-muted-foreground">
            Lorsque vous choisissez de faire un don, un formulaire HelloAsso peut être chargé sur le
            site, à votre demande uniquement. HelloAsso traite alors les données nécessaires au
            paiement et à l&apos;émission du don. Les finalités, les bases juridiques et le rôle
            respectif de l&apos;association Sankofa et de HelloAsso sont régis par les conditions
            applicables de HelloAsso. Aucun formulaire de don n&apos;est chargé tant que vous
            n&apos;avez pas cliqué pour l&apos;ouvrir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Politique de confidentialité</h2>
          <p className="text-muted-foreground">
            Ce site utilise{" "}
            <a
              href="https://umami.is"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Umami
            </a>
            , un outil de mesure d&apos;audience open source et respectueux de la vie privée.
          </p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-2">
            <li>Aucun cookie n&apos;est déposé sur votre navigateur</li>
            <li>
              Aucune donnée personnelle n&apos;est collectée (pas d&apos;adresse IP, pas de
              fingerprinting)
            </li>
            <li>
              Les données de fréquentation sont hébergées sur{" "}
              <a
                href="https://umami.is/privacy"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Umami Cloud
              </a>
              , conforme au RGPD (données anonymisées, pas de tracking individuel)
            </li>
          </ul>
          <p className="text-muted-foreground mt-2">
            Les seules données traitées sont des informations publiques concernant des personnalités
            politiques dans le cadre de leur mandat.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Propriété intellectuelle</h2>
          <p className="text-muted-foreground">
            Les données factuelles présentées sur ce site (votes, mandats, déclarations de
            patrimoine) sont des données publiques librement réutilisables.
          </p>
          <p className="text-muted-foreground mt-2">
            Le code source de ce projet est disponible sous{" "}
            <a
              href="https://github.com/ironlam/poligraph/blob/main/LICENSE"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              licence AGPL-3.0
            </a>
            .
          </p>
          <p className="text-muted-foreground mt-2">
            Une{" "}
            <a href="/docs/api" className="underline">
              API publique
            </a>{" "}
            permet la réutilisation des données. L&apos;accès est gratuit et ouvert, sous réserve de
            mention de la source (Poligraph).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Contact</h2>
          <p className="text-muted-foreground">
            Pour toute question concernant ce site :{" "}
            <a href="mailto:contact@poligraph.fr" className="underline font-semibold">
              contact@poligraph.fr
            </a>
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground mt-12">Dernière mise à jour : Mai 2026</p>
    </main>
  );
}
