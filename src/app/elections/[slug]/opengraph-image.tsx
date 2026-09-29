import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { OgLayout, OgCategoryLabel, OgBadge, OG_SIZE, truncateOg, OgEmoji } from "@/lib/og-utils";
import type { ElectionType, ElectionStatus } from "@/generated/prisma";

export const alt = "Élection sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

const TYPE_LABELS: Record<ElectionType, string> = {
  PRESIDENTIELLE: "Présidentielle",
  LEGISLATIVES: "Législatives",
  SENATORIALES: "Sénatoriales",
  MUNICIPALES: "Municipales",
  DEPARTEMENTALES: "Départementales",
  REGIONALES: "Régionales",
  EUROPEENNES: "Européennes",
  REFERENDUM: "Référendum",
};

const STATUS_LABELS: Record<ElectionStatus, string> = {
  UPCOMING: "À venir",
  REGISTRATION: "Inscriptions",
  CANDIDACIES: "Candidatures",
  CAMPAIGN: "Campagne",
  ROUND_1: "1er tour",
  BETWEEN_ROUNDS: "Entre-deux-tours",
  ROUND_2: "2nd tour",
  COMPLETED: "Terminée",
};

const STATUS_COLORS: Partial<Record<ElectionStatus, string>> = {
  UPCOMING: "#3b82f6",
  CAMPAIGN: "#f59e0b",
  ROUND_1: "#f97316",
  ROUND_2: "#f97316",
  COMPLETED: "#22c55e",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const election = await db.election.findUnique({
    where: { slug },
    select: {
      title: true,
      type: true,
      status: true,
      round1Date: true,
      round2Date: true,
      _count: { select: { candidacies: true } },
    },
  });

  if (!election) {
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
          Élection non trouvée
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const typeLabel = TYPE_LABELS[election.type] || election.type;
  const statusLabel = STATUS_LABELS[election.status] || election.status;
  const statusColor = STATUS_COLORS[election.status] || "#94a3b8";
  const date = election.round1Date
    ? new Date(election.round1Date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="🗳️" label={typeLabel} />

      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: "white",
          marginBottom: 24,
        }}
      >
        {truncateOg(election.title, 90)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20 }}>
        <OgBadge label={statusLabel} color={statusColor} />
        {date && <span style={{ fontSize: 22, color: "#94a3b8" }}>{date}</span>}
      </div>

      {election._count.candidacies > 0 && (
        <div style={{ display: "flex", gap: 8, fontSize: 22, color: "#94a3b8" }}>
          <OgEmoji emoji="👤" size={22} />
          <span>
            {election._count.candidacies} candidat{election._count.candidacies > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </OgLayout>,
    { ...OG_SIZE }
  );
}
