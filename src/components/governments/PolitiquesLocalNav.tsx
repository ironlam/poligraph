import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "personnes", label: "Personnes", href: "/politiques" },
  { key: "gouvernements", label: "Gouvernements", href: "/politiques/gouvernements" },
] as const;

/** Local navigation of the « Politiques » section: people directory and governments. */
export function PolitiquesLocalNav({ current }: { current: "personnes" | "gouvernements" }) {
  return (
    <nav aria-label="Politiques, sections" className="border-b bg-background">
      <ul className="container mx-auto flex gap-1 px-4">
        {ITEMS.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-12 items-center border-b-2 px-3 text-sm transition-colors sm:px-4",
                  active
                    ? "border-primary font-bold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
