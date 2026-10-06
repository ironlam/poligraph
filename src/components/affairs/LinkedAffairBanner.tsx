import { Link2 } from "lucide-react";
import Link from "next/link";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import type { Involvement } from "@/generated/prisma";

interface LinkedAffairProps {
  slug: string;
  title: string;
  involvement: Involvement;
  politician: {
    fullName: string;
    slug: string;
  };
}

export function LinkedAffairBanner({ linked }: { linked: LinkedAffairProps }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
      <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p className="text-sm text-blue-800 dark:text-blue-300">
        Cette affaire implique également{" "}
        <Link
          href={`/politiques/${linked.politician.slug}`}
          className="font-medium text-primary hover:underline"
          prefetch={false}
        >
          {linked.politician.fullName}
        </Link>{" "}
        en tant que {INVOLVEMENT_LABELS[linked.involvement].toLowerCase()}
        {" - "}
        <Link
          href={`/affaires/${linked.slug}`}
          className="text-primary hover:underline"
          prefetch={false}
        >
          voir la fiche
        </Link>
      </p>
    </div>
  );
}
