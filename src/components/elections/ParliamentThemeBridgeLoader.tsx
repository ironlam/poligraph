import type { ThemeCategory } from "@/generated/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getParliamentThemeSnapshot } from "@/lib/data/parliament-bridge";
import { getParliamentThemeTarget } from "@/lib/presidentielle/parliament-bridge";
import { ParliamentThemeBridge } from "./ParliamentThemeBridge";

/**
 * Reads what the bridge needs and renders it. A failed read hides the block: it is an extra door
 * on a page that stands without it, so it must never take the page down.
 */
export async function ParliamentThemeBridgeLoader({
  theme,
  source,
}: {
  theme: ThemeCategory;
  source: "theme" | "mesure";
}) {
  const target = getParliamentThemeTarget(theme);
  if (target === null) return null;

  const read = await Promise.all([
    getParliamentThemeSnapshot(target.theme),
    isFeatureEnabled("ASSEMBLEE_SECTION"),
  ]).catch(() => null);
  if (read === null) return null;

  const [snapshot, dossiersEnabled] = read;
  return (
    <ParliamentThemeBridge
      source={source}
      target={target}
      snapshot={snapshot}
      dossiersEnabled={dossiersEnabled}
    />
  );
}
