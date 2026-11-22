import type { Metadata } from "next";
import Link from "next/link";
import { ReportLink } from "@/components/feedback/ReportLink";
import { RAPPORT_CRC_REPONSE } from "@/config/juridictions-financieres";
import { openGraph } from "@/lib/seo/open-graph";
import { TERRITOIRES_OG_IMAGE } from "@/lib/territoires/og-image";
import { TERRITOIRES_METHODE_RAPPORTS_CRC_PATH, TERRITOIRES_PATH } from "@/lib/territoires/paths";

// Static text: 24 h backstop only, no data read.
export const revalidate = 86400;

const TITLE = "Méthode : rapports des chambres régionales des comptes";
const DESCRIPTION =
  "Quels rapports des chambres régionales et territoriales des comptes Poligraph signale sur la page d'une commune, d'un département ou d'une région, et comment.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: openGraph({ title: TITLE, description: DESCRIPTION, images: [TERRITOIRES_OG_IMAGE] }),
  alternates: { canonical: TERRITOIRES_METHODE_RAPPORTS_CRC_PATH },
};

function Rubrique({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl font-bold text-primary">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function MethodeRapportsCrcPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <nav aria-label="Fil d'Ariane" className="text-sm">
        <Link
          href={TERRITOIRES_PATH}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline underline-offset-2"
        >
          Territoires
        </Link>
      </nav>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">{TITLE}</h1>

      <Rubrique title="Ce qui est signalé">
        <p>
          Quand une chambre régionale ou territoriale des comptes publie un rapport
          d&apos;observations définitives sur une commune, un département ou une région, la page de
          cette collectivité le signale en une phrase : « La chambre régionale des comptes Grand Est
          a publié un rapport sur le département de la Meuse. » La phrase est accompagnée de la date
          de publication et d&apos;un lien vers le rapport sur ccomptes.fr.
        </p>
        <p>{RAPPORT_CRC_REPONSE}</p>
      </Rubrique>

      <Rubrique title="Source">
        <p>
          Les flux RSS que ccomptes.fr publie pour chacune des 21 chambres : 16 chambres régionales
          et 5 chambres territoriales. Poligraph en reprend le titre de la publication, sa date, la
          chambre et l&apos;adresse du rapport. Le texte de présentation et le contenu du rapport ne
          sont pas repris : ils se lisent sur ccomptes.fr.
        </p>
        <p>
          Le type de document se lit sur la page du rapport, dans le libellé de ses téléchargements.
          Seuls les rapports d&apos;observations définitives sont signalés.
        </p>
      </Rubrique>

      <Rubrique title="Rattachement et relecture">
        <p>
          La collectivité est lue dans le titre du rapport, par exemple « Commune de Chartres
          (Eure-et-Loir) ». Le rapprochement se fait sur le nom exact, sans tenir compte des
          majuscules, des tirets ni des apostrophes ; une commune n&apos;est cherchée que dans le
          département que donne le titre. Ce rattachement reste une proposition. Chaque notice est
          relue par une personne, qui vérifie la collectivité sur la page du rapport, la corrige au
          besoin, puis la publie ou la rejette. Rien n&apos;apparaît avant cette relecture.
        </p>
        <p>
          Une fois la notice publiée, la page de la collectivité l&apos;affiche dans les 24 heures.
        </p>
      </Rubrique>

      <Rubrique title="Limites">
        <p>
          Les rapports sur les intercommunalités, les syndicats, les hôpitaux, les sociétés
          d&apos;économie mixte et les autres organismes publics locaux ne sont pas signalés. Les
          avis de contrôle budgétaire non plus. Un titre qui nomme plusieurs collectivités, ou une
          collectivité unique comme la Collectivité de Corse, n&apos;est pas rattaché.
        </p>
        <p>
          Les rapports publiés avant le 23 octobre 2026 ne sont pas repris. Un rapport publié en
          plusieurs cahiers donne une notice par cahier.
        </p>
      </Rubrique>

      <Rubrique title="Ce que la notice ne dit pas">
        <p>
          La notice ne résume pas le rapport et n&apos;en tire aucune conclusion. Elle ne se
          rapporte à aucun élu ni à aucun parti, et aucune collectivité n&apos;est comparée à une
          autre. Pour savoir ce que la chambre a observé, il faut lire le rapport et, le cas
          échéant, la réponse de la collectivité.
        </p>
      </Rubrique>

      <Rubrique title="Historique de la méthode">
        <ul>
          <li>
            22 novembre 2026 : premières notices, à partir des rapports publiés depuis le 23 octobre
            2026.
          </li>
        </ul>
      </Rubrique>

      <p className="mt-8 text-sm">
        <ReportLink className="inline-flex min-h-11 items-center underline underline-offset-2" />
      </p>
    </div>
  );
}
