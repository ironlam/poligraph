import type { LinkProps } from "next/link";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PresidentialSubtopicLinkProps = {
  slug: string;
  label: string;
  href?: LinkProps["href"];
  className?: string;
};

export function PresidentialSubtopicLink({
  slug,
  label,
  href,
  className,
}: PresidentialSubtopicLinkProps) {
  return (
    <Link
      href={
        href ?? {
          pathname: "/elections/presidentielle-2027/recherche",
          query: { "sous-theme": slug },
        }
      }
      prefetch={false}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "h-auto min-h-11 rounded-full whitespace-normal px-3 py-2 text-left text-xs",
        className
      )}
    >
      {label}
    </Link>
  );
}
