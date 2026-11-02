import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ReportLink } from "@/components/feedback/ReportLink";
import type { HubPressArticle } from "@/lib/data/hub-press";
import { formatDate } from "@/lib/utils";

/**
 * Recent coverage by verified outlets, at most one new candidate per article. The titles are the
 * outlets' own, never rewritten. Article-to-politician links are automatic and moderated after
 * publication: an unlinked mention leaves this block on the next request.
 */
export function HubPress({ articles }: { articles: HubPressArticle[] }) {
  if (articles.length === 0) return null;

  return (
    <section aria-labelledby="hub-press-title" className="space-y-4">
      <h2
        id="hub-press-title"
        className="font-display text-xl font-bold tracking-tight md:text-2xl"
      >
        Dans la presse
      </h2>

      <div className="rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {articles.map((article) => (
            <li key={article.id} className="space-y-1.5 px-4 py-4">
              <p className="text-xs text-muted-foreground-strong">
                <span className="font-bold">{article.outlet}</span> ·{" "}
                {formatDate(article.publishedAt)}
              </p>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${article.title}, ${article.outlet} (lien externe)`}
                className="group inline-flex items-start gap-1.5 font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span>{article.title}</span>
                <ExternalLink
                  aria-hidden="true"
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              </a>
              <p className="text-xs text-muted-foreground">
                Cite :{" "}
                {article.candidates.map((candidate, index) => (
                  <span key={candidate.slug}>
                    {index > 0 && ", "}
                    <Link
                      href={`/politiques/${candidate.slug}`}
                      prefetch={false}
                      className="font-semibold text-primary hover:underline"
                    >
                      {candidate.name}
                    </Link>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            Articles de médias vérifiés. Les liens avec les candidatures sont établis
            automatiquement, puis contrôlés par l&apos;équipe. Titres repris tels quels.
          </p>
          <ReportLink className="inline-flex min-h-11 items-center font-bold text-primary hover:underline" />
        </div>
      </div>
    </section>
  );
}
