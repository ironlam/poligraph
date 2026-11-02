import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { DeleteDossierLinkButton } from "../_components/DeleteDossierLinkButton";
import {
  queryDossierLinksForModeration,
  type ModerationDossierLink,
} from "../_data/dossier-links-query";

export const metadata = {
  title: "Rapprochements avec le Parlement (admin)",
  robots: { index: false },
};

const KIND_LABEL = { SAME_OBJECT: "Même objet", BROADER_TEXT: "Texte plus large" } as const;

function groupByDossier(links: readonly ModerationDossierLink[]) {
  const groups = new Map<
    string,
    { title: string; slug: string | null; rows: ModerationDossierLink[] }
  >();
  for (const link of links) {
    const g = groups.get(link.dossierId) ?? {
      title: link.dossierTitle,
      slug: link.dossierSlug,
      rows: [],
    };
    g.rows.push(link);
    groups.set(link.dossierId, g);
  }
  return [...groups.values()];
}

export default async function AdminDossierLinksPage() {
  // The admin layout renders its children when the visitor is not authenticated, so it can let
  // the login page through. This page shows reviewer judgments, so it checks for itself.
  if (!(await isAuthenticated())) redirect("/admin/login");

  const { links, capped } = await queryDossierLinksForModeration();
  const groups = groupByDossier(links);
  const stale = links.filter((l) => !l.isCurrent).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4">
      <header className="flex flex-col gap-2">
        <Link href="/admin/mesures" prefetch={false} className="text-sm text-primary underline">
          Retour à la relecture des mesures
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Rapprochements avec le Parlement
        </h1>
        <p className="text-sm text-muted-foreground">
          {links.length === 1 ? "1 rapprochement relu" : `${links.length} rapprochements relus`}{" "}
          entre une mesure et un dossier législatif. Ils ne disent rien du vote d&apos;un élu.
        </p>
        {stale > 0 && (
          <p
            role="status"
            className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
          >
            {stale === 1
              ? "1 rapprochement porte sur une ancienne formulation de la mesure."
              : `${stale} rapprochements portent sur une ancienne formulation de la mesure.`}{" "}
            Ils ne sont plus à jour : les relire ou les retirer.
          </p>
        )}
        {capped && (
          <p role="status" className="rounded border border-border bg-muted p-3 text-sm">
            Seuls les 500 premiers rapprochements sont affichés.
          </p>
        )}
      </header>

      {groups.length === 0 ? (
        <section className="rounded border border-border p-6">
          <p className="font-medium">Aucun rapprochement relu pour l&apos;instant.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ils arrivent par l&apos;import des décisions de la page de revue.
          </p>
        </section>
      ) : (
        groups.map((g, i) => (
          <section
            key={g.title + i}
            aria-labelledby={`dossier-${i}`}
            className="flex flex-col gap-4 rounded-xl border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`dossier-${i}`} className="font-display text-lg font-bold">
                {g.title}
              </h2>
              {g.slug && (
                <Link
                  href={`/parlement/dossiers/${g.slug}`}
                  prefetch={false}
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                >
                  Voir le dossier
                </Link>
              )}
            </div>
            <ul className="flex flex-col gap-6">
              {g.rows.map((l) => (
                <li key={l.id} className="flex flex-col gap-3 border-t border-border pt-4">
                  <p className="font-medium">{l.measureText ?? "Mesure sans texte publié"}</p>
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center rounded border border-border px-2 py-0.5 font-medium">
                      {KIND_LABEL[l.linkKind]}
                    </span>
                    {!l.isCurrent && (
                      <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium dark:border-amber-800 dark:bg-amber-950/40">
                        Ancienne formulation de la mesure
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      Relu par {l.reviewedBy} le {l.checkedAt.toLocaleDateString("fr-FR")}
                    </span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <figure className="rounded border border-border bg-muted/40 p-3">
                      <figcaption className="text-xs font-bold text-muted-foreground">
                        Dans la mesure
                      </figcaption>
                      <blockquote className="mt-1 text-sm">« {l.measureQuote} »</blockquote>
                    </figure>
                    <figure className="rounded border border-border p-3">
                      <figcaption className="text-xs font-bold text-muted-foreground">
                        Dans le texte
                      </figcaption>
                      <blockquote className="mt-1 text-sm">« {l.textQuote} »</blockquote>
                    </figure>
                  </div>
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted-foreground">
                      Justification et méthode
                    </summary>
                    <p className="text-sm">{l.rationale}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Méthode : {l.searchMethod}</p>
                  </details>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/admin/mesures/${l.measureId}`}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline"
                    >
                      Ouvrir la mesure
                    </Link>
                    <DeleteDossierLinkButton linkId={l.id} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
