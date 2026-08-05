import { put } from "@vercel/blob";

/**
 * Store a cropped portrait on Vercel Blob.
 *
 * The `-portrait` suffix keeps these apart from the raw copies that
 * `/api/images/[id]` writes under `politicians/{id}`, so a cropped portrait is
 * identifiable from its URL alone and no extra column is needed to record that
 * the image is derived.
 */
export async function uploadCroppedPortrait(politicianId: string, buffer: Buffer): Promise<string> {
  const { url } = await put(`politicians/${politicianId}-portrait`, buffer, {
    access: "public",
    contentType: "image/jpeg",
    allowOverwrite: true,
  });
  return url;
}
