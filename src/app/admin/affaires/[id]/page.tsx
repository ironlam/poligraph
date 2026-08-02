import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CourtDecisionLinks } from "@/components/admin/CourtDecisionLinks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
} from "@/config/labels";
import { formatDate } from "@/lib/utils";
import { AffairPublishControl } from "@/components/admin/AffairPublishControl";
import type { BlockingDecision as BlockingDecisionPayload } from "@/lib/affairs/blocking-decisions";
import { PublicationStatus } from "@/generated/prisma";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getAffair(id: string) {
  return db.affair.findUnique({
    where: { id },
    include: {
      politician: { select: { id: true, fullName: true, slug: true } },
      sources: { orderBy: { publishedAt: "desc" } },
      // Links only: this surface manages the affair ↔ decision relation, never the
      // decision catalogue itself (#536).
      courtDecisions: {
        select: { notes: true, courtDecision: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

async function updatePublicationStatus(
  id: string,
  status: PublicationStatus
): Promise<{ ok: true } | { ok: false; error: string; blocking?: BlockingDecisionPayload[] }> {
  "use server";
  const { isAuthenticated } = await import("@/lib/auth");
  const { db } = await import("@/lib/db");
  const { invalidateEntity, invalidateAffectedPoliticians } = await import("@/lib/cache");
  const { revalidatePath } = await import("next/cache");
  const { assertPublishable, PublishGuardError, VERIFIED_BY_MODERATION, PUBLISHED_STATUS } =
    await import("@/lib/affairs/publish-guard");

  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return { ok: false, error: "Non autorisé" };
  }

  // Needed to invalidate the public surfaces: the affair page is keyed by slug
  // and the politician profile embeds the affair list.
  const target = await db.affair.findUnique({
    where: { id },
    select: { slug: true, politician: { select: { slug: true } } },
  });
  if (!target) {
    return { ok: false, error: "Affaire introuvable" };
  }

  if (status === PUBLISHED_STATUS) {
    // RGPD art. 10 : publication uniquement via le guard (sources +
    // rattachements validés, verifiedAt/verifiedBy écrits atomiquement).
    // Le refus est RETOURNÉ, pas jeté : en production, Next masque le message
    // des erreurs levées par une action serveur et la page tombe sur l'error
    // boundary générique au lieu d'afficher la raison au modérateur.
    try {
      await assertPublishable(id, { verifiedBy: VERIFIED_BY_MODERATION });
    } catch (err) {
      if (err instanceof PublishGuardError) {
        // The reasons carry the blocking decision ids. Flattening them to a sentence used
        // to strand the moderator: told that a decision blocked them, with no way to
        // reach it. They travel to the client so the block is resolvable in place.
        const { loadBlockingDecisions } = await import("@/lib/affairs/blocking-decisions");
        // Toute raison qui porte des identifiants, pas seulement celle qui existait
        // quand ce code a été écrit : la garde en a gagné une seconde
        // (ASSISTED_MATCHING_DECISION), et filtrer sur un code nommé aurait rendu le
        // panneau vide pour une affaire bloquée uniquement par une confirmation assistée.
        const decisionIds = err.reasons.flatMap((r) => ("decisionIds" in r ? r.decisionIds : []));
        return {
          ok: false,
          error: `Affaire non publiable : ${err.reasons.map((r) => r.message).join(" ; ")}`,
          blocking: await loadBlockingDecisions(decisionIds),
        };
      }
      throw err;
    }
    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: id,
        changes: { publicationStatus: status },
      },
    });
  } else {
    // Depublication: the row and its audit trail commit together, and nothing
    // is invalidated until the commit succeeds (#572).
    await db.$transaction([
      db.affair.update({ where: { id }, data: { publicationStatus: status } }),
      db.auditLog.create({
        data: {
          action: "UPDATE",
          entityType: "Affair",
          entityId: id,
          changes: { publicationStatus: status },
        },
      }),
    ]);
  }

  // Only past the commit. Purging "affairs" also regenerates the sitemap shards
  // that announce this URL (#572).
  invalidateEntity("affair", target.slug);
  invalidateAffectedPoliticians([target.politician?.slug]);
  revalidatePath(`/admin/affaires/${id}`);
  return { ok: true };
}

export default async function AdminAffairDetailPage({ params }: PageProps) {
  const { id } = await params;
  const affair = await getAffair(id);

  if (!affair) {
    notFound();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/affaires"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Retour aux affaires
          </Link>
          <h1 className="text-2xl font-bold mt-2">{affair.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <AffairPublishControl
            affairId={affair.id}
            politicianId={affair.politician.id}
            politicianName={affair.politician.fullName}
            currentStatus={affair.publicationStatus}
            onChange={updatePublicationStatus}
          />
          <Button asChild>
            <Link href={`/admin/affaires/${affair.id}/edit`}>Modifier</Link>
          </Button>
          <DeleteButton id={affair.id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Politique</p>
              <Link
                href={`/politiques/${affair.politician.slug}`}
                className="font-medium text-primary hover:underline"
              >
                {affair.politician.fullName}
              </Link>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Catégorie</p>
              <p className="font-medium">{AFFAIR_CATEGORY_LABELS[affair.category]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <Badge className={AFFAIR_STATUS_COLORS[affair.status]}>
                {AFFAIR_STATUS_LABELS[affair.status]}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Slug</p>
              <p className="font-mono text-sm">{affair.slug}</p>
            </div>
          </div>

          {/* Références éditoriales. Les identifiants de décision (ECLI, pourvoi)
              se lisent sur les décisions rattachées, plus bas sur cette page (#545). */}
          {affair.caseNumber && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              {affair.caseNumber && (
                <div>
                  <p className="text-sm text-muted-foreground">N° de dossier</p>
                  <p className="font-mono text-sm">{affair.caseNumber}</p>
                </div>
              )}
              {affair.court && (
                <div>
                  <p className="text-sm text-muted-foreground">Juridiction</p>
                  <p className="text-sm">{affair.court}</p>
                </div>
              )}
            </div>
          )}

          {AFFAIR_STATUS_NEEDS_PRESUMPTION[affair.status] && (
            <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm">
              Cette affaire est en cours. La présomption d&apos;innocence s&apos;applique.
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-1">Description</p>
            <p className="whitespace-pre-wrap">{affair.description}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chronologie</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Date des faits</dt>
              <dd className="font-medium">
                {affair.factsDate ? formatDate(affair.factsDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date de révélation</dt>
              <dd className="font-medium">
                {affair.startDate ? formatDate(affair.startDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date du verdict</dt>
              <dd className="font-medium">
                {affair.verdictDate ? formatDate(affair.verdictDate) : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {(affair.sentence || affair.appeal) && (
        <Card>
          <CardHeader>
            <CardTitle>Condamnation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {affair.sentence && (
              <div>
                <p className="text-sm text-muted-foreground">Peine prononcée</p>
                <p className="font-medium">{affair.sentence}</p>
              </div>
            )}
            {affair.appeal && <Badge variant="outline">Appel en cours</Badge>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sources ({affair.sources.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {affair.sources.map((source) => (
              <li key={source.id} className="border-b pb-4 last:border-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {source.title}
                </a>
                <p className="text-sm text-muted-foreground">
                  {source.publisher} &bull; {formatDate(source.publishedAt)}
                </p>
                {source.excerpt && (
                  <blockquote className="mt-2 text-sm italic text-muted-foreground border-l-2 pl-3">
                    {source.excerpt}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <CourtDecisionLinks
            affairId={affair.id}
            initialLinks={affair.courtDecisions.map((link) => ({
              id: link.courtDecision.id,
              ecli: link.courtDecision.ecli,
              pourvoiNumber: link.courtDecision.pourvoiNumber,
              court: link.courtDecision.court,
              chamber: link.courtDecision.chamber,
              decisionDate: link.courtDecision.decisionDate?.toISOString() ?? null,
              solution: link.courtDecision.solution,
              sourceUrl: link.courtDecision.sourceUrl,
              linkNotes: link.notes,
            }))}
          />
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">
            Créée le {formatDate(affair.createdAt)} &bull; Mise à jour le{" "}
            {formatDate(affair.updatedAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const { isAuthenticated } = await import("@/lib/auth");
        const { redirect } = await import("next/navigation");
        const { db } = await import("@/lib/db");

        const authenticated = await isAuthenticated();
        if (!authenticated) {
          redirect("/admin/login");
        }

        await db.affair.delete({ where: { id } });
        redirect("/admin/affaires");
      }}
    >
      <Button type="submit" variant="destructive">
        Supprimer
      </Button>
    </form>
  );
}
