/**
 * Shared utilities for OpenGraph images (opengraph-image.tsx).
 *
 * Provides consistent branding across all OG thumbnails:
 * - Tricolor band (bleu/blanc/rouge)
 * - Owl watermark
 * - Footer with owl icon
 */

import { BRAND_NAVY, BRAND_PAGE, BRAND_RED } from "@/config/brand";

// Owl SVG as base64 data URI (from public/logo-inverse.svg)
const OWL_BASE64 =
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgOTAwIiBmaWxsPSJub25lIj4KICA8IS0tIE9wZW4gYm9vayAod2hpdGUgcGFnZXMgKyByZWQgYmluZGluZywgcmVhZHMgb24gbWFyaW5lKSAtLT4KICA8cGF0aCBkPSJNNDUwIDY3MiBMMjYyIDYzOCBMMjgyIDcyMiBMNDUwIDczMCBaIiBmaWxsPSIjZmZmZmZmIi8+CiAgPHBhdGggZD0iTTQ1MCA2NzIgTDYzOCA2MzggTDYxOCA3MjIgTDQ1MCA3MzAgWiIgZmlsbD0iI2ZmZmZmZiIvPgogIDxwYXRoIGQ9Ik00NDAgNjYwIEw0NjAgNjYwIEw0NjAgNzQ0IEw0NDAgNzQ0IFoiIGZpbGw9IiNlZDI5MzkiLz4KCiAgPCEtLSBPd2wgKHdoaXRlIGJvZHksIG5lZ2F0aXZlIGV5ZXM6IG5hdnkgZGlzYyArIHdoaXRlIHB1cGlsKSAtLT4KICA8IS0tIEVhciB0dWZ0cyAtLT4KICA8cGF0aCBkPSJNMzMwIDIzOCBMMzYwIDE1MCBMNDEwIDIzMyBaIiBmaWxsPSIjZmZmZmZmIi8+CiAgPHBhdGggZD0iTTU3MCAyMzggTDU0MCAxNTAgTDQ5MCAyMzMgWiIgZmlsbD0iI2ZmZmZmZiIvPgogIDwhLS0gSGVhZCArIGJvZHkgc2lsaG91ZXR0ZSAtLT4KICA8ZWxsaXBzZSBjeD0iNDUwIiBjeT0iMzUyIiByeD0iMTkwIiByeT0iMTYwIiBmaWxsPSIjZmZmZmZmIi8+CiAgPGVsbGlwc2UgY3g9IjQ1MCIgY3k9IjQ5MCIgcng9IjE1NiIgcnk9IjE0MCIgZmlsbD0iI2ZmZmZmZiIvPgogIDwhLS0gRXllcyAtLT4KICA8Y2lyY2xlIGN4PSIzNzIiIGN5PSIzNDIiIHI9IjcwIiBmaWxsPSIjMDAyNjU0Ii8+CiAgPGNpcmNsZSBjeD0iNTI4IiBjeT0iMzQyIiByPSI3MCIgZmlsbD0iIzAwMjY1NCIvPgogIDxjaXJjbGUgY3g9IjM3MiIgY3k9IjM1MCIgcj0iMzAiIGZpbGw9IiNmZmZmZmYiLz4KICA8Y2lyY2xlIGN4PSI1MjgiIGN5PSIzNTAiIHI9IjMwIiBmaWxsPSIjZmZmZmZmIi8+CiAgPCEtLSBCZWFrIC0tPgogIDxwYXRoIGQ9Ik00NTAgMzcyIEw0MjQgNDA4IEw0NzYgNDA4IFoiIGZpbGw9IiNlZDI5MzkiLz4KPC9zdmc+Cg==";

export const OWL_DATA_URI = `data:image/svg+xml;base64,${OWL_BASE64}`;

// Tricolor band colors (Poligraph brand palette)
const BLEU = BRAND_NAVY;
const ROUGE = BRAND_RED;

// Common OG image dimensions
export const OG_SIZE = { width: 1200, height: 630 };

// Background gradient used across all OG images
export const OG_BACKGROUND = "linear-gradient(135deg, #1e3a5f 0%, #0f1f3a 100%)";

/**
 * Wraps OG image content with the standard Poligraph branding:
 * - Tricolor band at the top
 * - Owl watermark in the bottom-right
 * - Footer with owl + "poligraph.fr"
 */
export function OgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: OG_BACKGROUND,
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Tricolor band */}
      <div style={{ display: "flex", width: "100%", height: 6, flexShrink: 0 }}>
        <div style={{ flex: 1, background: BLEU }} />
        <div style={{ flex: 1, background: BRAND_PAGE }} />
        <div style={{ flex: 1, background: ROUGE }} />
      </div>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "40px 60px 24px",
        }}
      >
        {children}
      </div>

      {/* Owl watermark — bottom right */}
      <img
        src={OWL_DATA_URI}
        width={180}
        height={180}
        style={{
          position: "absolute",
          bottom: -20,
          right: -10,
          opacity: 0.08,
        }}
      />

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 60px 20px",
        }}
      >
        <img src={OWL_DATA_URI} width={24} height={24} style={{ opacity: 0.5 }} />
        <span style={{ fontSize: 18, color: "#64748b" }}>poligraph.fr</span>
      </div>
    </div>
  );
}

/**
 * Category label (e.g. "FACT-CHECK", "VOTE", "AFFAIRE")
 */
export function OgCategoryLabel({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <span
        style={{
          fontSize: 18,
          color: "#94a3b8",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 3,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Large colored badge (e.g. verdict, vote result, affair status)
 */
export function OgBadge({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 32px",
        borderRadius: 999,
        background: `${color}20`,
        border: `3px solid ${color}`,
        color: color,
        fontSize: 28,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

/**
 * Truncate text to a maximum number of characters
 */
export function truncateOg(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

/**
 * Content types a portrait may have to be embedded in an OG image.
 *
 * `next/og` rasterises through Satori + resvg, which decode PNG, JPEG and GIF and
 * nothing else. A WebP or an AVIF does not degrade, it throws while the image is
 * being generated, and the route then returns a 500 to a social crawler that will
 * cache the failure. Unknown types are therefore dropped before rendering, and the
 * caller falls back to initials.
 */
const OG_PORTRAIT_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);

/** A portrait is a few dozen kilobytes. Anything past this is not one. */
const OG_PORTRAIT_MAX_BYTES = 5_000_000;

/**
 * Download a portrait and return it as a data URI, or null when anything is off.
 *
 * Satori can fetch a remote `src` itself, but a slow or dead upstream host then
 * takes the whole image route down with it — the portraits we hold point at
 * external sources as often as at our own Blob CDN. Fetching here bounds the wait,
 * checks what came back, and turns every failure into "no photo" rather than into
 * a broken preview card.
 */
export async function loadOgPortrait(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const httpsUrl = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
  if (!httpsUrl.startsWith("https://")) return null;

  try {
    const response = await fetch(httpsUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !OG_PORTRAIT_TYPES.has(contentType)) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > OG_PORTRAIT_MAX_BYTES) return null;

    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
