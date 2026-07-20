import { activeSecondaryPlatforms } from "@/config/donation";
import { SecondaryPlatformLink } from "@/components/donation/SecondaryPlatformLink";

// activeSecondaryPlatforms() always excludes "helloasso" (primary: true),
// so the remaining ids are safely narrowed here.
type NonPrimaryPlatformId = "tipeee" | "github-sponsors" | "kofi";

export function SecondaryPlatforms() {
  const platforms = activeSecondaryPlatforms();
  if (platforms.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {platforms.map((platform) => (
        <div key={platform.id} className="rounded-xl border bg-card p-4">
          <h3 className="font-display text-base font-bold">{platform.displayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{platform.description}</p>
          <SecondaryPlatformLink
            platformId={platform.id as NonPrimaryPlatformId}
            url={platform.url!}
            displayName={platform.displayName}
          />
        </div>
      ))}
    </div>
  );
}
