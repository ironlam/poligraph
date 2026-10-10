import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SourceLine } from "@/components/ui/SourceLine";
import { DATAGOUV_REUSES, publishedContributors, sortedMentions } from "@/config/press-space";
import { BRAND_NAVY, BRAND_PAGE } from "@/config/brand";
import { formatDateFrUTC } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Presse et partenaires",
  description:
    "Articles et sites qui citent Poligraph, présentation et logos à télécharger, contact presse et contributeurs du projet.",
  alternates: { canonical: "/espace-presse" },
};

const CONTACT = "contact@poligraph.fr";
const REPO = "https://github.com/ironlam/poligraph";

const LOGOS = [
  { file: "/logo.svg", label: "Logo couleur", format: "SVG", dark: false },
  { file: "/logo-poligraph-1024.png", label: "Logo couleur", format: "PNG, 1024 px", dark: false },
  { file: "/logo-mono.svg", label: "Logo monochrome", format: "SVG", dark: false },
  { file: "/logo-inverse.svg", label: "Logo pour fond sombre", format: "SVG", dark: true },
];

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-primary"
    >
      {children}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function MailLink() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-medium underline hover:text-primary">
      {CONTACT}
    </a>
  );
}

export default function EspacePressePage() {
  const mentions = sortedMentions();
  const contributors = publishedContributors();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-display text-3xl font-extrabold tracking-tight">
        Presse et partenaires
      </h1>
      <p className="text-lg text-muted-foreground">
        Poligraph rassemble les informations publiques sur les responsables politiques français :
        mandats, votes parlementaires, déclarations de patrimoine et affaires judiciaires. Le site
        est édité par l&apos;Association Sankofa. Pour une demande presse ou un partenariat, écrivez
        à <MailLink />.
      </p>

      <nav aria-label="Sur cette page" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a href="#mentions" className="underline hover:text-primary">
          Ils parlent de Poligraph
        </a>
        <a href="#kit" className="underline hover:text-primary">
          Kit presse
        </a>
        <a href="#collaborer" className="underline hover:text-primary">
          Collaborer avec nous
        </a>
        <a href="#contributeurs" className="underline hover:text-primary">
          Contributeurs
        </a>
      </nav>

      <section id="mentions" className="mt-12 scroll-mt-20">
        <h2 className="mb-6 text-2xl font-bold">Ils parlent de Poligraph</h2>
        <ul className="list-none space-y-6 p-0">
          {mentions.map((mention) => (
            <li key={mention.url} className="rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">
                {mention.source}
                {mention.publishedAt && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {formatDateFrUTC(mention.publishedAt)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{mention.title}</p>
              <blockquote className="mt-3 border-l-[3px] border-brand pl-4">
                « {mention.quote} »
              </blockquote>
              <SourceLine
                className="mt-3"
                sources={[
                  { label: mention.source, url: mention.url },
                  { label: "Archive", url: mention.archiveUrl },
                ]}
                consultedAt={mention.consultedAt}
                reportHref={null}
              />
            </li>
          ))}
        </ul>

        <div id="datagouv" className="mt-8 scroll-mt-20">
          <h3 className="mb-2 text-lg font-semibold">Poligraph sur data.gouv.fr</h3>
          <p>
            Le projet a déclaré ses réutilisations des données publiques sur data.gouv.fr, la
            plateforme des données ouvertes de l&apos;État :
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {DATAGOUV_REUSES.map((reuse) => (
              <li key={reuse.url}>
                <ExternalLink href={reuse.url}>{reuse.title}</ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="kit" className="mt-12 scroll-mt-20">
        <h2 className="mb-4 text-2xl font-bold">Kit presse</h2>

        <h3 className="mb-2 text-lg font-semibold">Présentation en une phrase</h3>
        <p>
          Poligraph est un site gratuit qui rassemble, à partir de sources publiques, les mandats,
          les votes, les déclarations de patrimoine et les affaires judiciaires des responsables
          politiques français.
        </p>

        <h3 className="mb-2 mt-6 text-lg font-semibold">Présentation en un paragraphe</h3>
        <p>
          Poligraph réunit sur une même fiche ce que les institutions publient sur chaque
          responsable politique : ses mandats, ses votes à l&apos;Assemblée nationale et au Sénat,
          les déclarations déposées auprès de la HATVP et les affaires judiciaires documentées par
          des sources vérifiables. Chaque information renvoie à sa source. Le site est gratuit, sans
          publicité, et édité par l&apos;Association Sankofa, association loi 1901. Son code est
          publié sous licence AGPL-3.0.
        </p>

        <h3 className="mb-2 mt-6 text-lg font-semibold">Logos</h3>
        <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
          {LOGOS.map((logo) => (
            <li key={logo.file} className="flex items-center gap-4 rounded-lg border bg-card p-3">
              <span
                className="flex shrink-0 items-center justify-center rounded-md p-2"
                style={{ backgroundColor: logo.dark ? BRAND_NAVY : BRAND_PAGE }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, offered as-is for download */}
                <img src={logo.file} alt="" width={56} height={56} />
              </span>
              <span className="text-sm">
                <a href={logo.file} download className="font-medium underline hover:text-primary">
                  {logo.label}
                </a>
                <span className="block text-muted-foreground">{logo.format}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Les logos peuvent être reproduits sans modification pour illustrer un article ou une
          présentation consacrés à Poligraph.
        </p>

        <h3 className="mb-2 mt-6 text-lg font-semibold">Chiffres et contact</h3>
        <p>
          Les chiffres à jour sont sur la page{" "}
          <Link href="/statistiques" className="underline hover:text-primary">
            Statistiques
          </Link>
          . Contact presse : <MailLink />.
        </p>
      </section>

      <section id="collaborer" className="mt-12 scroll-mt-20">
        <h2 className="mb-4 text-2xl font-bold">Collaborer avec nous</h2>
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 text-lg font-semibold">Journalistes</h3>
            <p>
              Pour vérifier une donnée ou obtenir une précision sur la méthode, écrivez à{" "}
              <MailLink />. Les règles de collecte sont décrites dans{" "}
              <Link href="/methodologie" className="underline hover:text-primary">
                Méthodologie
              </Link>{" "}
              et{" "}
              <Link href="/sources" className="underline hover:text-primary">
                Sources et principes
              </Link>
              .
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-lg font-semibold">Chercheurs et développeurs</h3>
            <p>
              Les données sont accessibles par l&apos;
              <Link href="/docs/api" className="underline hover:text-primary">
                API publique
              </Link>
              . Le code est sur <ExternalLink href={REPO}>GitHub</ExternalLink>, et le{" "}
              <ExternalLink href={`${REPO}/blob/main/CONTRIBUTING.md`}>
                guide de contribution
              </ExternalLink>{" "}
              explique comment proposer une correction.
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-lg font-semibold">Associations et médias</h3>
            <p>
              Un partenariat, une intégration ou une réutilisation des données se discute à{" "}
              <MailLink />.
            </p>
          </div>
        </div>
      </section>

      <section id="contributeurs" className="mt-12 scroll-mt-20">
        <h2 className="mb-4 text-2xl font-bold">Contributeurs</h2>
        <p>
          Des personnes extérieures au projet proposent du code, signalent des erreurs ou suggèrent
          des fonctionnalités sur <ExternalLink href={`${REPO}/issues`}>GitHub</ExternalLink>.
        </p>
        {contributors.length > 0 ? (
          <ul className="mt-4 list-none space-y-4 p-0">
            {contributors.map((contributor) => (
              <li key={contributor.handle} className="rounded-lg border bg-card p-4">
                <p className="font-semibold">
                  <ExternalLink href={`https://github.com/${contributor.handle}`}>
                    {contributor.handle}
                  </ExternalLink>
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {contributor.contributions.map((contribution) => (
                    <li key={contribution.url}>
                      {contribution.verb} {contribution.label} (
                      <ExternalLink href={contribution.url}>
                        {contribution.url.includes("/pull/") ? "PR" : "issue"} n°
                        {contribution.url.split("/").pop()}
                      </ExternalLink>
                      , {contribution.state})
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-muted-foreground">
            Leurs noms apparaîtront ici avec leur accord.
          </p>
        )}
      </section>
    </div>
  );
}
