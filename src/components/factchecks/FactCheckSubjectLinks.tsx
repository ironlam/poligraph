import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FactCheckSubjectLinks as SubjectLinksData } from "@/lib/data/factcheck-subject-links";

export interface FactCheckSubject extends SubjectLinksData {
  slug: string;
  fullName: string;
  /** The person's fact-check landing (`factCheckPoliticianPath`), passed in like FactCheckPeople. */
  landingHref: string;
}

const linkClass =
  "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border text-sm font-medium hover:bg-muted transition-colors";

/** Label of the link to the person's landing, which holds `count` fact-checks (this one included). */
export function landingLinkLabel(count: number): string {
  if (count > 1) return `Voir les ${count.toLocaleString("fr-FR")} vérifications`;
  return "Voir sa page de vérifications";
}

/**
 * On a fact-check without a single author, one card per person it names on a confirmed mention:
 * their fact-check landing, their asset declarations, their candidate fiche. Each link shows only
 * when the base holds what it opens. Fixed labels, no generated text, same format for everyone.
 */
export function FactCheckSubjectLinks({ subjects }: { subjects: FactCheckSubject[] }) {
  if (subjects.length === 0) return null;
  return (
    <>
      {subjects.map((subject) => {
        const headingId = `verifie-sur-${subject.slug}`;
        return (
          <section key={subject.slug} aria-labelledby={headingId}>
            <Card className="mb-6">
              <CardHeader>
                <h2 id={headingId} className="text-sm font-semibold">
                  Tout ce qui a été vérifié sur {subject.fullName}
                </h2>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-2">
                  <li>
                    <Link prefetch={false} href={subject.landingHref} className={linkClass}>
                      {landingLinkLabel(subject.factCheckCount)}
                    </Link>
                  </li>
                  {subject.hasPublishedAssetDeclaration && (
                    <li>
                      <Link
                        prefetch={false}
                        href={`/politiques/${subject.slug}?tab=patrimoine`}
                        className={linkClass}
                      >
                        Ses déclarations de patrimoine
                      </Link>
                    </li>
                  )}
                  {subject.hasCandidacy && (
                    <li>
                      <Link
                        prefetch={false}
                        href={`/elections/presidentielle-2027/candidats/${subject.slug}`}
                        className={linkClass}
                      >
                        Sa fiche de candidat 2027
                      </Link>
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </>
  );
}
