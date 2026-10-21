import type { Metadata } from "next";
import Link from "next/link";
import { ReportLink } from "@/components/feedback/ReportLink";
import { notFound } from "next/navigation";
import {
  methodeSources,
  repereMethode,
  REPERE_METHODES,
  repereMethodePath,
} from "@/config/territoire-methodes";
import { TERRITOIRES_PATH } from "@/lib/territoires/paths";
import { formatDateFrUTC } from "@/lib/utils";

// Static text: 24 h backstop only, no data read.
export const revalidate = 86400;

export function generateStaticParams() {
  return REPERE_METHODES.map((m) => ({ indicateur: m.slug }));
}

interface PageProps {
  params: Promise<{ indicateur: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { indicateur } = await params;
  const m = repereMethode(indicateur);
  if (!m) return { title: "Méthode introuvable", robots: { index: false, follow: true } };
  const title = `Méthode : ${m.title}`;
  const description = `Ce que montre le chiffre « ${m.title} » du territoire en chiffres, sa source, son calcul et ses limites.`;
  return {
    title,
    description,
    openGraph: { title, description },
    alternates: { canonical: repereMethodePath(m.slug) },
  };
}

function Rubrique({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl font-bold text-primary">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default async function MethodePage({ params }: PageProps) {
  const { indicateur } = await params;
  const m = repereMethode(indicateur);
  if (!m) notFound();
  const sources = methodeSources(m);

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
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">
        Méthode : {m.title}
      </h1>

      <Rubrique title="Ce que montre le chiffre">
        <p>{m.montre}</p>
      </Rubrique>

      <Rubrique title="Source et licence">
        <ul className="space-y-3">
          {sources.map((s) => (
            <li key={s.id}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {s.name}
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
              , {s.producer}.{" "}
              {s.licence.name ? (
                <>
                  Licence : {s.licence.name}, lue le {formatDateFrUTC(s.licence.verifiedAt)}.
                </>
              ) : (
                <>Licence non confirmée. {s.licence.note}</>
              )}
              {s.attribution && <> Attribution : {s.attribution}</>}
            </li>
          ))}
        </ul>
        <p className="mt-3">
          La compilation de Poligraph est publiée sous licence ODbL 1.0 ; chaque source garde sa
          propre licence.
        </p>
      </Rubrique>

      <Rubrique title="Calcul">
        <p>{m.calcul}</p>
      </Rubrique>
      <Rubrique title="Limites">
        <p>{m.limites}</p>
      </Rubrique>
      <Rubrique title="Ce que la donnée ne dit pas">
        <p>{m.neDitPas}</p>
      </Rubrique>
      <Rubrique title="Historique de la méthode">
        <ul>
          {m.historique.map((h) => (
            <li key={h.date}>
              {formatDateFrUTC(h.date)} : {h.text}
            </li>
          ))}
        </ul>
      </Rubrique>

      <p className="mt-8 text-sm">
        <ReportLink className="inline-flex min-h-11 items-center underline underline-offset-2" />
      </p>
    </div>
  );
}
