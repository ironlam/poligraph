import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { OgLayout, OgCategoryLabel, OgBadge, OG_SIZE, truncateOg } from "@/lib/og-utils";
import { isAccusedInvolvement } from "@/config/certainty";
import type { AffairStatus } from "@/generated/prisma";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";
import { getPublishedAffairWhere } from "@/lib/affairs/public-filters";

export const alt = "Affaire judiciaire sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

const STATUS_LABELS: Partial<Record<AffairStatus, string>> = {
  ENQUETE_PRELIMINAIRE: "Enquête préliminaire",
  INSTRUCTION: "Instruction",
  MISE_EN_EXAMEN: "Mise en examen",
  RENVOI_TRIBUNAL: "Renvoi tribunal",
  PROCES_EN_COURS: "Procès en cours",
  CONDAMNATION_PREMIERE_INSTANCE: "Condamnation (1re inst.)",
  APPEL_EN_COURS: "Appel en cours",
  POURVOI_EN_CASSATION: "Condamnation (pourvoi en cours)",
  CONDAMNATION_DEFINITIVE: "Condamnation définitive",
  RELAXE: "Relaxe",
  ACQUITTEMENT: "Acquittement",
  NON_LIEU: "Non-lieu",
  PRESCRIPTION: "Action publique éteinte par prescription",
  CLASSEMENT_SANS_SUITE: "Classement sans suite",
  INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN: "Instruction clôturée, sans mise en examen",
};

const STATUS_COLORS: Partial<Record<AffairStatus, string>> = {
  CONDAMNATION_DEFINITIVE: "#ef4444",
  CONDAMNATION_PREMIERE_INSTANCE: "#f97316",
  POURVOI_EN_CASSATION: "#f97316",
  PROCES_EN_COURS: "#f59e0b",
  RELAXE: "#22c55e",
  ACQUITTEMENT: "#22c55e",
  NON_LIEU: "#22c55e",
  CLASSEMENT_SANS_SUITE: "#6b7280",
};

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const affair = await db.affair.findFirst({
    where: {
      slug,
      ...getPublishedAffairWhere(),
      politician: PUBLIC_POLITICIAN_WHERE,
    },
    select: {
      title: true,
      status: true,
      involvement: true,
      politician: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!affair) {
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
          Affaire non trouvée
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const statusLabel = STATUS_LABELS[affair.status] || affair.status;
  const statusColor = STATUS_COLORS[affair.status] || "#94a3b8";

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="⚖️" label="Affaire judiciaire" />

      <div
        style={{
          fontSize: 38,
          fontWeight: 700,
          color: "white",
          marginBottom: 16,
        }}
      >
        {truncateOg(affair.title, 100)}
      </div>

      {/* Hors du site, ne pas accoler le nom au titre d'une personne non mise
          en cause (I7) : l'image OG suit la même règle que le <title>. */}
      {isAccusedInvolvement(affair.involvement) && (
        <div style={{ fontSize: 26, color: "#94a3b8", marginBottom: 24 }}>
          {`${affair.politician.firstName} ${affair.politician.lastName}`}
        </div>
      )}

      <div style={{ display: "flex" }}>
        <OgBadge label={statusLabel} color={statusColor} />
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
