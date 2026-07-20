import { HELLOASSO_ORIGIN } from "@/config/donation";

export const FRAME_MIN_HEIGHT = 200;
export const FRAME_MAX_HEIGHT = 3000;

// Returns the validated iframe height, or null if the message must be ignored.
export function parseHelloAssoHeight(
  event: { origin: string; source: unknown; data: unknown },
  expectedSource: unknown
): number | null {
  if (event.origin !== HELLOASSO_ORIGIN) return null;
  if (event.source !== expectedSource) return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const height = (data as { height?: unknown }).height;
  if (typeof height !== "number" || !Number.isFinite(height)) return null;
  if (height < FRAME_MIN_HEIGHT || height > FRAME_MAX_HEIGHT) return null;
  return height;
}
