"use client";

import { trackUmami } from "@/lib/umami";
import type { SupportPlatform } from "@/config/donation";

type SecondaryPlatformId = Extract<SupportPlatform["id"], "tipeee" | "github-sponsors" | "kofi">;

export function SecondaryPlatformLink({
  platformId,
  url,
  displayName,
}: {
  platformId: SecondaryPlatformId;
  url: string;
  displayName: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackUmami("donation_platform_click", { platform: platformId })}
      className="mt-3 inline-block text-sm text-primary hover:underline"
    >
      Soutenir sur {displayName}
      <span className="sr-only"> (ouvre un nouvel onglet)</span>
    </a>
  );
}
