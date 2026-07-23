import { ImageResponse } from "next/og";
import { BRAND_NAVY } from "@/config/brand";
import { OWL_DATA_URI } from "@/lib/og-utils";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_NAVY,
        borderRadius: 36,
      }}
    >
      {/* Owl mark (marine/inverse variant) centered on the navy tile */}
      <img src={OWL_DATA_URI} width={132} height={132} alt="" />
    </div>,
    size
  );
}
