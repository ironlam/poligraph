import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { themeToSlug } from "@/lib/theme-utils";

/**
 * Plan 6 V1 (path-based): revalidate the public surfaces a title appears on after
 * a status/title change, so an approval becomes visible and a reject/regenerate
 * hides it. Covers vote detail + list + theme + (when spotlight-eligible) home.
 * Politician vote tabs intentionally refresh on their own ISR interval (V1).
 */
export async function revalidatePublicForScrutin(scrutinId: string): Promise<void> {
  const scrutin = await db.scrutin.findUnique({
    where: { id: scrutinId },
    select: { slug: true, theme: true, importance: { select: { isKeyVote: true } } },
  });
  if (!scrutin) return;
  if (scrutin.slug) revalidatePath(`/parlement/votes/${scrutin.slug}`);
  revalidatePath("/parlement/votes");
  if (scrutin.theme) revalidatePath(`/parlement/votes/themes/${themeToSlug(scrutin.theme)}`);
  if (scrutin.importance?.isKeyVote) {
    revalidatePath("/");
    revalidatePath("/parlement");
  }
}
