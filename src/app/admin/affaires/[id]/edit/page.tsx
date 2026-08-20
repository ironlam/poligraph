import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { AffairForm } from "@/components/admin/AffairForm";
import { AffairEditMatchingPanel } from "@/components/admin/AffairEditMatchingPanel";
import { loadBlockingDecisionsForAffair } from "@/lib/affairs/affair-blocking";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getAffair(id: string) {
  return db.affair.findUnique({
    where: { id },
    include: {
      politician: { select: { id: true, fullName: true } },
      sources: true,
    },
  });
}

export default async function EditAffairPage({ params }: PageProps) {
  const { id } = await params;
  const affair = await getAffair(id);

  if (!affair) {
    notFound();
  }

  // Surfaced before any publish attempt: a press link left unvalidated blocks publication,
  // and until now that was only resolvable from the read-only detail page.
  const blocking = await loadBlockingDecisionsForAffair(affair.id);

  // Format data for the form
  const initialData = {
    id: affair.id,
    politicianId: affair.politicianId,
    title: affair.title,
    description: affair.description,
    status: affair.status,
    category: affair.category,
    involvement: affair.involvement,
    subjectLabel: affair.subjectLabel ?? undefined,
    subjectKind: affair.subjectKind ?? undefined,
    subjectNote: affair.subjectNote ?? undefined,
    involvementNote: affair.involvementNote ?? undefined,
    publicationStatus: affair.publicationStatus,
    factsDate: affair.factsDate ? affair.factsDate.toISOString().split("T")[0]! : undefined,
    startDate: affair.startDate ? affair.startDate.toISOString().split("T")[0]! : undefined,
    verdictDate: affair.verdictDate ? affair.verdictDate.toISOString().split("T")[0]! : undefined,
    sentence: affair.sentence || undefined,
    appeal: affair.appeal,
    prisonMonths: affair.prisonMonths ?? undefined,
    // `?? null` and not `?? undefined`: 0 is a value here ("entirely suspended"), and the
    // form has to be able to hold "not established" as a distinct state (#576).
    prisonFirmMonths: affair.prisonFirmMonths ?? null,
    fineAmount: affair.fineAmount != null ? Number(affair.fineAmount) : undefined,
    ineligibilityMonths: affair.ineligibilityMonths ?? undefined,
    ineligibilityFirmMonths: affair.ineligibilityFirmMonths ?? null,
    communityService: affair.communityService ?? undefined,
    otherSentence: affair.otherSentence || undefined,
    court: affair.court || undefined,
    caseNumber: affair.caseNumber || undefined,
    linkedAffairId: affair.linkedAffairId ?? null,
    sources: affair.sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      publisher: s.publisher,
      publishedAt: s.publishedAt.toISOString().split("T")[0]!,
      excerpt: s.excerpt || "",
      sourceType: s.sourceType || "MANUAL",
    })),
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/admin/affaires/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Retour à l&apos;affaire
          </Link>
          <h1 className="text-2xl font-bold mt-2 mb-6">Modifier l&apos;affaire</h1>
        </div>
        <DeleteButton id={id} />
      </div>
      {blocking.length > 0 && (
        <div className="mb-6">
          <AffairEditMatchingPanel
            politicianId={affair.politicianId}
            politicianName={affair.politician.fullName}
            decisions={blocking}
          />
        </div>
      )}
      <AffairForm initialData={initialData} />
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  return (
    <form
      action={async () => {
        "use server";
        const { isAuthenticated } = await import("@/lib/auth");
        const { db } = await import("@/lib/db");
        const { invalidateEntity } = await import("@/lib/cache");
        const { redirect } = await import("next/navigation");

        const authenticated = await isAuthenticated();
        if (!authenticated) {
          redirect("/admin/login");
        }

        const affair = await db.affair.findUnique({
          where: { id },
          select: { title: true, politician: { select: { slug: true } } },
        });

        await db.affair.delete({ where: { id } });

        await db.auditLog.create({
          data: {
            action: "DELETE",
            entityType: "Affair",
            entityId: id,
            changes: { title: affair?.title },
          },
        });

        invalidateEntity("affair");
        if (affair?.politician?.slug) invalidateEntity("politician", affair.politician.slug);

        redirect("/admin/affaires");
      }}
    >
      <Button type="submit" variant="destructive">
        Supprimer
      </Button>
    </form>
  );
}
