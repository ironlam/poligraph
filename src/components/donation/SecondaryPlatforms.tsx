import { activeSecondaryPlatforms } from "@/config/donation";

export function SecondaryPlatforms() {
  const platforms = activeSecondaryPlatforms();
  if (platforms.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {platforms.map((platform) => (
        <div key={platform.id} className="rounded-xl border bg-card p-4">
          <h3 className="font-display text-base font-bold">{platform.displayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{platform.description}</p>
          <a
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            Soutenir sur {platform.displayName}
            <span className="sr-only"> (ouvre un nouvel onglet)</span>
          </a>
        </div>
      ))}
    </div>
  );
}
