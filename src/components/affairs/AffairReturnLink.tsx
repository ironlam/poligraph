"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { parseReturn } from "@/lib/affairs/listing-return";

/**
 * The non-destructive return control. Isolated as its own client island (read
 * of useSearchParams) so the rest of the sticky bar and the page stay static
 * (ISR): it is rendered inside a <Suspense> whose fallback is the generic
 * return below. The canonical stays /affaires/<slug>, so `?retour=` never
 * enters the index.
 */
const LINK_CLASS =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";

export function AffairReturnLinkFallback() {
  return (
    <Link href="/affaires" className={LINK_CLASS}>
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      Retour aux affaires
    </Link>
  );
}

export function AffairReturnLink() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { href, label } = parseReturn(searchParams.get("retour"), searchParams.get("rn"));

  // Prefer a real "back" (restores scroll + filters) only when the previous page
  // is the listing itself; otherwise the labelled destination always wins.
  function handleReturn(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === window.location.origin && ref.pathname === "/affaires") {
        e.preventDefault();
        router.back();
      }
    } catch {
      // No/opaque referrer: let the Link navigate to href.
    }
  }

  return (
    <Link href={href} onClick={handleReturn} className={LINK_CLASS}>
      <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
