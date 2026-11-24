"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Lien vers le formulaire de retour, qui reçoit la page d'où l'on vient (chemin seul).
 * `nofollow` : présent sur chaque page avec un `?from=` différent, il offrait aux robots une
 * adresse à explorer par page du site.
 */
export function ReportLink({
  className,
  children = "Signaler une erreur",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const href =
    pathname && pathname !== "/signaler"
      ? `/signaler?from=${encodeURIComponent(pathname)}`
      : "/signaler";
  return (
    <Link href={href} prefetch={false} rel="nofollow" className={className}>
      {children}
    </Link>
  );
}
