import { ImageResponse } from "next/og";
import { franceOutlineDataUri } from "@/lib/territoires/region-og-shape";
import { OgLayout, OG_SIZE } from "@/lib/og-utils";

export const alt = "Territoires sur Poligraph : les élus et les décisions de votre territoire";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <OgLayout>
      <div style={{ display: "flex", flex: 1, justifyContent: "space-between", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 26, color: "#cbd5e1", marginBottom: 16 }}>
            Territoires · communes, départements, régions
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "white",
              lineHeight: 1.08,
              marginBottom: 28,
            }}
          >
            Les élus et les décisions de votre territoire
          </div>
          <div style={{ fontSize: 30, color: "#e2e8f0" }}>
            Maire, députés, résultats, avec la source de chaque information
          </div>
        </div>
        <img
          src={franceOutlineDataUri()}
          width={330}
          height={387}
          alt=""
          style={{ objectFit: "contain" }}
        />
      </div>
    </OgLayout>,
    { ...OG_SIZE }
  );
}
