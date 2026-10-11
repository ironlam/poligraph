import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { getDepartmentBySlug } from "@/config/departments";
import { OgLayout, OgCategoryLabel, OG_SIZE, OgEmoji } from "@/lib/og-utils";
import { getDepartmentShapeDataUri } from "@/lib/og-department-shape";

export const alt = "Département sur Poligraph";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dept = getDepartmentBySlug(slug);

  if (!dept) {
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
          Département non trouvé
        </div>
      </OgLayout>,
      { ...OG_SIZE }
    );
  }

  const [deputyCount, senatorCount] = await Promise.all([
    db.politician.count({
      where: {
        mandates: {
          some: { type: "DEPUTE", isCurrent: true, departmentCode: dept.code },
        },
      },
    }),
    db.politician.count({
      where: {
        mandates: {
          some: { type: "SENATEUR", isCurrent: true, departmentCode: dept.code },
        },
      },
    }),
  ]);

  const shapeUri = getDepartmentShapeDataUri(dept.code, { width: 400, height: 400 }, "#3b82f6");

  return new ImageResponse(
    <OgLayout>
      {shapeUri && (
        <img
          src={shapeUri}
          width={400}
          height={400}
          style={{
            position: "absolute",
            right: 40,
            top: 100,
            opacity: 0.08,
          }}
        />
      )}

      <OgCategoryLabel emoji="📍" label="Département" />

      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: "#3b82f6",
          marginBottom: 8,
        }}
      >
        {dept.code}
      </div>

      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          color: "white",
          marginBottom: 12,
        }}
      >
        {dept.name}
      </div>

      <div style={{ fontSize: 24, color: "#94a3b8", marginBottom: 28 }}>{dept.region}</div>

      <div style={{ display: "flex", gap: 40, fontSize: 22, color: "#94a3b8" }}>
        {deputyCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="🏛️" size={26} />
            <span>
              {deputyCount} député{deputyCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
        {senatorCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <OgEmoji emoji="🏛️" size={26} />
            <span>
              {senatorCount} sénateur{senatorCount > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
