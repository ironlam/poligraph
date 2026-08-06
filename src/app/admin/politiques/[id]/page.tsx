import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { OPEN_MEMBERSHIP_ORDER_BY } from "@/services/politician";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { DATA_SOURCE_LABELS, MANDATE_TYPE_LABELS } from "@/config/labels";
import { MandateUrlEditor } from "@/components/admin/MandateUrlEditor";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { DuplicateDetector } from "@/components/admin/DuplicateDetector";
import { EditableCivilStatusCard } from "@/components/admin/EditableCivilStatusCard";
import { EditablePhotoCard } from "@/components/admin/EditablePhotoCard";
import { EditableAffairsCard } from "@/components/admin/EditableAffairsCard";
import { EditablePartyCard } from "@/components/admin/EditablePartyCard";
import { ensureContrast } from "@/lib/contrast";
import type { MandateType } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getPolitician(id: string) {
  return db.politician.findUnique({
    where: { id },
    include: {
      currentParty: true,
      externalIds: {
        orderBy: { source: "asc" },
      },
      mandates: {
        orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }],
        select: {
          id: true,
          type: true,
          title: true,
          institution: true,
          isCurrent: true,
          startDate: true,
          endDate: true,
          officialUrl: true,
          sourceUrl: true,
        },
      },
      affairs: {
        orderBy: { verdictDate: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          category: true,
          involvement: true,
          verdictDate: true,
          startDate: true,
          factsDate: true,
        },
      },
      partyHistory: {
        orderBy: OPEN_MEMBERSHIP_ORDER_BY,
        include: {
          party: {
            select: { id: true, name: true, shortName: true, color: true },
          },
        },
      },
      _count: { select: { affairs: true } },
    },
  });
}

async function getAllParties() {
  return db.party.findMany({
    select: { id: true, name: true, shortName: true, color: true },
    orderBy: { shortName: "asc" },
  });
}

export default async function AdminPoliticianPage({ params }: PageProps) {
  const { id } = await params;
  const [politician, allParties] = await Promise.all([getPolitician(id), getAllParties()]);

  if (!politician) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/politiques"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Retour à la liste
        </Link>
      </div>

      <div className="flex items-start gap-6">
        <PoliticianAvatar photoUrl={politician.photoUrl} fullName={politician.fullName} size="xl" />
        <div>
          <h1 className="text-2xl font-bold">{politician.fullName}</h1>
          {politician.currentParty && (
            <Badge
              variant="secondary"
              style={{
                backgroundColor: politician.currentParty.color
                  ? `${politician.currentParty.color}20`
                  : undefined,
                color: politician.currentParty.color
                  ? ensureContrast(politician.currentParty.color, "#ffffff")
                  : undefined,
              }}
              title={politician.currentParty.name}
            >
              {politician.currentParty.shortName}
            </Badge>
          )}
          {politician.mandates.find((m) => m.isCurrent) && (
            <p className="text-muted-foreground mt-1">
              {politician.mandates.find((m) => m.isCurrent)!.title}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Informations générales — éditable */}
        <EditableCivilStatusCard politician={politician} />

        {/* Photo — éditable */}
        <EditablePhotoCard politician={politician} />

        {/* External IDs */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Identifiants externes ({politician.externalIds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {politician.externalIds.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="text-left pb-2 font-medium">
                        Source
                      </th>
                      <th scope="col" className="text-left pb-2 font-medium">
                        ID
                      </th>
                      <th scope="col" className="text-left pb-2 font-medium">
                        URL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {politician.externalIds.map((extId) => (
                      <tr key={extId.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Badge variant="outline">
                            {DATA_SOURCE_LABELS[extId.source] || extId.source}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 font-mono">{extId.externalId}</td>
                        <td className="py-2">
                          {extId.url ? (
                            <a
                              href={extId.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs"
                            >
                              {extId.url}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">Aucun identifiant externe</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mandats */}
      <Card>
        <CardHeader>
          <CardTitle>Mandats ({politician.mandates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {politician.mandates.length > 0 ? (
            <div className="space-y-4">
              {politician.mandates.map((mandate) => {
                const start = new Date(mandate.startDate).toLocaleDateString("fr-FR");
                const end = mandate.endDate
                  ? new Date(mandate.endDate).toLocaleDateString("fr-FR")
                  : "en cours";
                return (
                  <div key={mandate.id} className="border p-4 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {mandate.isCurrent && (
                          <Badge variant="default" className="text-xs">
                            Actif
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {MANDATE_TYPE_LABELS[mandate.type as MandateType] || mandate.type}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {start} — {end}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{mandate.title}</p>
                    <p className="text-xs text-muted-foreground">{mandate.institution}</p>
                    <MandateUrlEditor
                      mandateId={mandate.id}
                      officialUrl={mandate.officialUrl}
                      sourceUrl={mandate.sourceUrl}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">Aucun mandat enregistré.</p>
          )}
        </CardContent>
      </Card>

      {/* Affaires judiciaires — éditable inline */}
      <EditableAffairsCard politicianId={politician.id} affairs={politician.affairs} />

      {/* Parti et affiliations — éditable */}
      <EditablePartyCard
        politicianId={politician.id}
        currentParty={politician.currentParty}
        partyHistory={politician.partyHistory}
        allParties={allParties}
      />

      {/* Détection de doublons */}
      <DuplicateDetector politicianId={politician.id} affairCount={politician.affairs.length} />

      {/* Synchronisation */}
      <SyncPanel politicianId={politician.id} affairCount={politician.affairs.length} />

      {/* Actions rapides */}
      <Card>
        <CardHeader>
          <CardTitle>Actions rapides</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href={`/politiques/${politician.slug}`} target="_blank">
              Voir la page publique
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/affaires?politician=${politician.slug}`} target="_blank">
              Voir les affaires (public)
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
