import Link from "next/link";

const HUB_LINKS = [
  {
    key: "overview",
    label: "Vue d’ensemble",
    mobileLabel: "Aperçu",
    href: "/elections/presidentielle-2027",
  },
  {
    key: "themes",
    label: "Thématiques",
    mobileLabel: "Thèmes",
    href: "/elections/presidentielle-2027/themes",
  },
  {
    key: "candidates",
    label: "Candidatures",
    mobileLabel: "Candidats",
    href: "/elections/presidentielle-2027/candidats",
  },
  {
    key: "compare",
    label: "Comparer",
    mobileLabel: "Comparer",
    href: "/elections/presidentielle-2027/comparer",
  },
] as const;

export type PresidentialHubSection = (typeof HUB_LINKS)[number]["key"];

export function PresidentialHubNav({ active }: { active: PresidentialHubSection }) {
  return (
    <nav aria-label="Explorer la présidentielle 2027">
      <ul className="grid w-full grid-cols-4 border-b border-border sm:flex sm:gap-1">
        {HUB_LINKS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap border-b-2 px-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none sm:w-auto sm:px-3 sm:text-sm ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground-strong hover:border-border hover:text-foreground"
                }`}
              >
                <span className="sm:hidden">{item.mobileLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
