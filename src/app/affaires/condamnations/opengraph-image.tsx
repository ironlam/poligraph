import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";
import { OgLayout, OgCategoryLabel, OG_SIZE } from "@/lib/og-utils";

export const alt = "Responsables politiques condamnés sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [totalDef, totalPro] = await Promise.all([
    // Condamnations pénales de la personne mise en cause, restreintes au statut de chaque compteur.
    db.affair.count({
      where: { ...getConvictionOnlyWhere(), status: "CONDAMNATION_DEFINITIVE" },
    }),
    db.affair.count({
      where: {
        ...getConvictionOnlyWhere(),
        status: { in: ["CONDAMNATION_PREMIERE_INSTANCE", "APPEL_EN_COURS"] },
      },
    }),
  ]);

  return new ImageResponse(
    <OgLayout>
      <OgCategoryLabel emoji="⚖️" label="Condamnations" />

      <div
        style={{
          display: "flex",
          fontSize: 52,
          fontWeight: 800,
          color: "white",
          lineHeight: 1.15,
          marginBottom: 32,
        }}
      >
        Responsables politiques condamnés
      </div>

      <div style={{ display: "flex", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, color: "#ef4444" }}>
            {totalDef}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>
            condamnations définitives
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 700, color: "#f97316" }}>
            {totalPro}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>non définitives</div>
        </div>
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
