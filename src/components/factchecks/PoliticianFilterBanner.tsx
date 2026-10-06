// src/components/factchecks/PoliticianFilterBanner.tsx
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { X } from "lucide-react";

interface PoliticianFilterBannerProps {
  fullName: string;
  slug: string;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  party: string | null;
  factcheckCount: number;
  onDismiss: () => void;
}

export function PoliticianFilterBanner({
  fullName,
  photoUrl,
  blobPhotoUrl,
  party,
  factcheckCount,
  onDismiss,
}: PoliticianFilterBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg">
      <PoliticianAvatar
        photoUrl={photoUrl}
        blobPhotoUrl={blobPhotoUrl}
        fullName={fullName}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm">{fullName}</span>
        {party && <span className="text-xs text-primary ml-2">{party}</span>}
      </div>
      <span className="text-xs text-primary whitespace-nowrap">
        {factcheckCount} fact-check{factcheckCount > 1 ? "s" : ""}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-primary hover:text-foreground transition-colors p-1"
        aria-label={`Retirer le filtre ${fullName}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
