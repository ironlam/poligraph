"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { returnEntryFor, type ReturnEntry } from "./return-entry";

/**
 * « Retour à … » on a profile opened from the « Gouvernements » section. Rendered only when the
 * stored entry targets this profile, is less than 30 minutes old and points inside the section.
 * Read after mount: the server render and the first client render are both empty.
 */
export function ProfileReturnLink({ slug }: { slug: string }) {
  const [entry, setEntry] = useState<ReturnEntry | null>(null);

  useEffect(() => {
    setEntry(returnEntryFor(slug));
  }, [slug]);

  if (!entry) return null;

  return (
    <div className="mb-4">
      <Link
        href={entry.returnUrl}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-bold text-primary hover:bg-muted"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
        {entry.label}
      </Link>
    </div>
  );
}
