import Link from "next/link";

interface TypeTab {
  key: string;
  label: string;
  count: number;
  href: string;
}

interface ScrutinTypeTabsProps {
  tabs: TypeTab[];
  activeKey: string;
  /** Names the landmark when several tab bars share a page. */
  ariaLabel?: string;
}

export function ScrutinTypeTabs({ tabs, activeKey, ariaLabel }: ScrutinTypeTabsProps) {
  const Wrapper = ariaLabel ? "nav" : "div";
  return (
    <Wrapper className="flex border-b mb-6" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`flex-1 md:flex-none px-4 py-3 text-sm font-medium text-center transition-colors min-h-[44px] ${
              isActive
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}{" "}
            <span className="text-muted-foreground">({tab.count.toLocaleString("fr-FR")})</span>
          </Link>
        );
      })}
    </Wrapper>
  );
}
