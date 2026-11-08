import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import type { DossierStatus } from "@/generated/prisma";
import { OgLayout, OgCategoryLabel, OgBadge, OG_SIZE, truncateOg } from "@/lib/og-utils";

export const alt = "Dossier législatif sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

const STATUS_LABELS: Record<DossierStatus, string> = {
  DEPOSE: "Déposé",
  EN_COMMISSION: "En commission",
  EN_COURS: "En discussion",
  CONSEIL_CONSTITUTIONNEL: "Conseil constitutionnel",
  ADOPTE: "Adopté",
  REJETE: "Rejeté",
  REJETE_NAVETTE: "Rejeté, procédure poursuivie",
  RETIRE: "Retiré",
  CADUQUE: "Caduc",
};

const STATUS_COLORS: Partial<Record<DossierStatus, string>> = {
  ADOPTE: "#22c55e",
  REJETE: "#ef4444",
  REJETE_NAVETTE: "#f97316",
  RETIRE: "#6b7280",
  CADUQUE: "#6b7280",
  EN_COMMISSION: "#f59e0b",
  EN_COURS: "#3b82f6",
  CONSEIL_CONSTITUTIONNEL: "#a855f7",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Try slug first, then id/externalId
  let dossier = await db.legislativeDossier.findUnique({
    where: { slug },
    select: { title: true, shortTitle: true, number: true, status: true, category: true },
  });
  if (!dossier) {
    dossier = await db.legislativeDossier.findUnique({
      where: { id: slug },
      select: { title: true, shortTitle: true, number: true, status: true, category: true },
    });
  }

  if (!dossier) {
    return new ImageResponse(
      <OgLayout>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 32,
          }}
        >
          Dossier non trouvé
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const statusLabel = STATUS_LABELS[dossier.status] || dossier.status;
  const statusColor = STATUS_COLORS[dossier.status] || "#94a3b8";
  const displayTitle = dossier.shortTitle || dossier.title;

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="📜" label="Dossier législatif" />

      {/* Number badge — monospace pill */}
      {dossier.number && (
        <div style={{ display: "flex", marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              borderRadius: 8,
              background: "#ffffff15",
              color: "#94a3b8",
              fontSize: 24,
              fontFamily: "monospace",
            }}
          >
            {dossier.number}
          </div>
        </div>
      )}

      {/* Title */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: "white",
          marginBottom: 24,
        }}
      >
        {truncateOg(displayTitle, 130)}
      </div>

      {/* Status badge */}
      <div style={{ display: "flex" }}>
        <OgBadge label={statusLabel} color={statusColor} />
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
