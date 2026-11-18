"use client";

import { useState } from "react";
import Image from "next/image";
import { cn, normalizeImageUrl } from "@/lib/utils";

interface PoliticianAvatarProps {
  photoUrl: string | null;
  /**
   * Cached copy on Vercel Blob, preferred over `photoUrl` when present.
   *
   * For Commons-sourced portraits this is the version cropped on the subject's
   * face, so passing it is what makes the framing visible. It also stops the
   * page depending on an external host staying up: `photoUrl` is the provenance
   * record, not the best thing to serve.
   */
  blobPhotoUrl: string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  priority?: boolean; // Load immediately (above the fold)
  /**
   * Rendered width in CSS pixels, when a caller shrinks the avatar below its `size` through
   * `className`. Defaults to the width of `size`.
   */
  fixedPx?: number;
}

/**
 * The image is sized with width/height, never `fill` + `sizes`: with `sizes`, next/image writes
 * every configured width into the srcSet (16 candidates, 2.6 KB per avatar), against two for a
 * fixed width. On a scrutin page listing 576 voters that was 1.5 MB of a 2.6 MB document.
 */
const SIZE_PX = { sm: 40, md: 56, lg: 96, xl: 128 } as const;

const sizeClasses = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-xl",
  lg: "w-24 h-24 text-3xl",
  xl: "w-32 h-32 text-4xl",
};

export function PoliticianAvatar({
  photoUrl,
  blobPhotoUrl,
  firstName,
  lastName,
  fullName,
  size = "md",
  className = "",
  priority = false,
  fixedPx,
}: PoliticianAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Derive names - support both firstName/lastName and fullName
  const derivedFirstName = firstName || fullName?.split(" ")[0] || "";
  const derivedLastName = lastName || fullName?.split(" ").slice(1).join(" ") || "";
  const initials = `${derivedFirstName[0] || "?"}${derivedLastName[0] || "?"}`;
  const displayName = fullName || `${derivedFirstName} ${derivedLastName}`;
  const sizeClass = sizeClasses[size];

  // The Blob copy wins when there is one: it is the cropped portrait, and it is
  // served from our own CDN rather than from the upstream source.
  const imageSrc = normalizeImageUrl(blobPhotoUrl ?? photoUrl);

  // Fallback to initials if no photo or image fails to load
  if (!imageSrc || imageError) {
    return (
      <div
        role="img"
        aria-label={`Avatar de ${displayName}`}
        className={cn(
          "rounded-full bg-gray-200 flex items-center justify-center font-semibold text-gray-600 flex-shrink-0",
          sizeClass,
          className
        )}
      >
        <span aria-hidden="true">{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative rounded-full overflow-hidden flex-shrink-0", sizeClass, className)}
    >
      {/* Skeleton placeholder while image loads */}
      {!imageLoaded && <div className="absolute inset-0 animate-pulse rounded-full bg-muted" />}
      <Image
        src={imageSrc}
        alt={displayName}
        width={fixedPx ?? SIZE_PX[size]}
        height={fixedPx ?? SIZE_PX[size]}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-200",
          imageLoaded ? "opacity-100" : "opacity-0"
        )}
        onError={() => setImageError(true)}
        onLoad={() => setImageLoaded(true)}
        loading={priority ? "eager" : "lazy"}
        priority={priority}
      />
    </div>
  );
}
