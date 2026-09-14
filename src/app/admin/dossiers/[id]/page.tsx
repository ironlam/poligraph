import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_COLORS,
  DOSSIER_CATEGORY_COLORS,
} from "@/config/labels";
import { formatDate } from "@/lib/utils";
import { extractText } from "@/lib/parsing/html-utils";
import { DossierSummaryEditor } from "@/components/admin/DossierSummaryEditor";
import { DossierAliasEditor } from "@/components/admin/DossierAliasEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getDossier(id: string) {
  return db.legislativeDossier.findUnique({
    where: { id },
    include: {
      amendments: {
        orderBy: { number: "asc" },
        take: 10,
      },
      aliases: { orderBy: [{ isPreferred: "desc" }, { label: "asc" }] },
    },
  });
}

export default async function AdminDossierDetailPage({ params }: PageProps) {
  const { id } = await params;
  const dossier = await getDossier(id);

  if (!dossier) {
    notFound();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/dossiers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Retour aux dossiers
          </Link>
          <h1 className="text-2xl font-bold mt-2">{dossier.shortTitle || dossier.title}</h1>
          {dossier.number && <p className="text-muted-foreground">{dossier.number}</p>}
        </div>
        <div className="flex gap-2">
          {dossier.sourceUrl && (
            <Button variant="outline" asChild>
              <a href={dossier.sourceUrl} target="_blank" rel="noopener noreferrer">
                Voir sur AN
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Informations principales */}
      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Statut</p>
              <Badge className={DOSSIER_STATUS_COLORS[dossier.status]}>
                {DOSSIER_STATUS_LABELS[dossier.status]}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Catégorie</p>
              {dossier.category ? (
                <Badge
                  className={
                    DOSSIER_CATEGORY_COLORS[dossier.category] || "bg-gray-100 text-gray-800"
                  }
                >
                  {dossier.category}
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de dépôt</p>
              <p className="font-medium">
                {dossier.filingDate ? formatDate(dossier.filingDate) : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ID externe</p>
              <p className="font-mono text-sm">{dossier.externalId}</p>
            </div>
          </div>

          {/* Titre complet si différent du court */}
          {dossier.shortTitle && dossier.shortTitle !== dossier.title && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Titre complet</p>
              <p className="text-sm">{dossier.title}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Noms d’usage sourcés</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Un nom d’usage reste une appellation éditoriale. Le titre officiel est conservé et une
            source est obligatoire avant publication.
          </p>
          <DossierAliasEditor dossierId={dossier.id} aliases={dossier.aliases} />
        </CardContent>
      </Card>

      {/* Résumé IA - Éditable */}
      <DossierSummaryEditor
        dossierId={dossier.id}
        currentSummary={dossier.summary}
        summaryDate={dossier.summaryDate}
        title={dossier.title}
        sourceUrl={dossier.sourceUrl}
      />

      {/* Dates importantes */}
      <Card>
        <CardHeader>
          <CardTitle>Chronologie</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Dépôt</dt>
              <dd className="font-medium">
                {dossier.filingDate ? formatDate(dossier.filingDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Examen</dt>
              <dd className="font-medium">
                {dossier.examinationDate ? formatDate(dossier.examinationDate) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Adoption</dt>
              <dd className="font-medium">
                {dossier.adoptionDate ? formatDate(dossier.adoptionDate) : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Amendements */}
      {dossier.amendments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Amendements ({dossier.amendments.length}
              {dossier.amendments.length === 10 ? "+" : ""})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {dossier.amendments.map((amendment) => (
                <li
                  key={amendment.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <span className="font-mono text-sm">#{amendment.number}</span>
                    {amendment.article && (
                      <span className="text-muted-foreground ml-2">
                        Art. {extractText(amendment.article)}
                      </span>
                    )}
                    {amendment.authorName && (
                      <span className="text-sm ml-2">{extractText(amendment.authorName)}</span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      amendment.status === "ADOPTE"
                        ? "bg-green-100 text-green-800"
                        : amendment.status === "REJETE"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                    }
                  >
                    {amendment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Métadonnées */}
      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">
            Importé le {formatDate(dossier.createdAt)} &bull; Mis à jour le{" "}
            {formatDate(dossier.updatedAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
