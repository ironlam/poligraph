import { Card } from "@/components/ui/card";
import { getDepartmentName } from "@/config/departments";
import { getRegionByCode } from "@/config/regions";
import { db } from "@/lib/db";
import { parseEvenementPayload, phraseEvenement } from "@/lib/territoires/evenements";
import { formatDate } from "@/lib/utils";
import { RapportCrcActions } from "./RapportCrcActions";

export const metadata = {
  title: "Rapports des chambres des comptes (admin)",
  robots: { index: false },
};

const PAGE_SIZE = 100;

async function loadBrouillons() {
  const rows = await db.territoireEvenement.findMany({
    where: { type: "RAPPORT_CRC", status: "DRAFT" },
    orderBy: [{ occurredOn: "desc" }, { id: "asc" }],
    take: PAGE_SIZE,
    select: {
      id: true,
      territoryType: true,
      territoryCode: true,
      occurredOn: true,
      payload: true,
      sourceLabel: true,
      sourceUrl: true,
    },
  });
  const communeIds = rows.filter((r) => r.territoryType === "COM" && r.territoryCode);
  const communes = new Map(
    (
      await db.commune.findMany({
        where: { id: { in: communeIds.map((r) => r.territoryCode!) } },
        select: { id: true, name: true, departmentCode: true },
      })
    ).map((c) => [c.id, `${c.name} (${getDepartmentName(c.departmentCode) ?? c.departmentCode})`])
  );
  return rows.map((r) => {
    const evenement = parseEvenementPayload("RAPPORT_CRC", r.payload);
    const code = r.territoryCode;
    const territoire = !code
      ? null
      : r.territoryType === "COM"
        ? (communes.get(code) ?? code)
        : r.territoryType === "DEP"
          ? `Département ${getDepartmentName(code) ?? code}`
          : `Région ${getRegionByCode(code)?.name ?? code}`;
    return {
      ...r,
      phrase: evenement ? phraseEvenement(evenement) : null,
      titre: evenement?.type === "RAPPORT_CRC" ? evenement.titre : null,
      territoire,
    };
  });
}

export default async function AdminRapportsCrcPage() {
  const brouillons = await loadBrouillons();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Rapports des chambres des comptes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Notices importées des flux de ccomptes.fr, en brouillon. Le territoire est une proposition
          tirée du titre : vérifiez-le sur la page du rapport, corrigez-le au besoin, puis publiez.
          La publication ne rafraîchit aucune page : elles suivent leur cache de 24 h.
        </p>
      </header>

      {brouillons.length === 0 && <p className="text-sm">Aucune notice en attente.</p>}

      {brouillons.map((b) => (
        <Card key={b.id} className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            {formatDate(b.occurredOn)}, {b.sourceLabel}
          </p>
          <p className="font-semibold">{b.phrase ?? "Contenu illisible : à rejeter."}</p>
          {b.titre && <p className="text-sm [overflow-wrap:anywhere]">Titre publié : {b.titre}</p>}
          <p className="text-sm">
            Territoire proposé :{" "}
            {b.territoire ? (
              <>
                {b.territoire}{" "}
                <span className="tabular-nums text-muted-foreground">
                  ({b.territoryType} {b.territoryCode})
                </span>
              </>
            ) : (
              <span className="font-semibold">aucun, à choisir</span>
            )}
          </p>
          <a
            href={b.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-primary underline [overflow-wrap:anywhere]"
          >
            Page du rapport sur ccomptes.fr (nouvel onglet)
          </a>
          <RapportCrcActions
            id={b.id}
            territoryType={b.territoryType as "COM" | "DEP" | "REG"}
            territoryCode={b.territoryCode}
          />
        </Card>
      ))}
    </div>
  );
}
