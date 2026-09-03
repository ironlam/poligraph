"use client";

import Image from "next/image";
import { useState } from "react";
import { getAccessibleTextColor } from "@/lib/contrast";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  sm: "h-6 w-6 rounded-md text-[9px]",
  md: "h-12 w-12 rounded-xl text-xs",
  lg: "h-16 w-16 rounded-2xl text-sm sm:h-24 sm:w-24",
} as const;

export function PartyLogo({
  logoUrl,
  label,
  shortName,
  color,
  size = "sm",
  className,
}: {
  logoUrl: string | null;
  label: string;
  shortName?: string | null;
  color?: string | null;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];

  if (logoUrl && !logoFailed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden border border-border bg-white",
          sizeClass,
          className
        )}
      >
        <Image
          src={logoUrl}
          alt=""
          fill
          sizes={size === "lg" ? "96px" : size === "md" ? "48px" : "24px"}
          onError={() => setLogoFailed(true)}
          className="object-contain p-1"
        />
      </span>
    );
  }

  const initials = shortName
    ? shortName.slice(0, 3).toLocaleUpperCase("fr")
    : label
        .split(/\s+/u)
        .filter(Boolean)
        .slice(0, 3)
        .map((word) => word[0])
        .join("")
        .toLocaleUpperCase("fr");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-border bg-muted font-bold",
        sizeClass,
        className
      )}
      style={color ? { backgroundColor: color, color: getAccessibleTextColor(color) } : undefined}
    >
      {initials}
    </span>
  );
}
