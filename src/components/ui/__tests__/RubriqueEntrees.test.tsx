import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Landmark } from "lucide-react";
import { RubriqueEntrees, type RubriqueEntree } from "@/components/ui/RubriqueEntrees";

// Expose the prefetch prop, which next/link does not render as an attribute.
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));

function entrees(n: number): RubriqueEntree[] {
  return Array.from({ length: n }, (_, i) => ({
    href: `/rubrique/${i}`,
    title: `Entrée ${i}`,
    detail: `Détail ${i}`,
    icon: Landmark,
  }));
}

describe("RubriqueEntrees", () => {
  it("rend un lien par entrée, sans préchargement", () => {
    render(<RubriqueEntrees titre="Explorer" titreId="t" entrees={entrees(5)} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
    for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");
    expect(screen.getByRole("heading", { level: 2, name: "Explorer" })).toBeInTheDocument();
  });

  it("aligne 5 entrées sur une ligne en desktop", () => {
    render(<RubriqueEntrees titre="Explorer" titreId="t" entrees={entrees(5)} />);
    expect(screen.getByRole("list")).toHaveClass("lg:grid-cols-5");
  });

  it("étire la dernière tuile sur mobile quand le nombre est impair", () => {
    render(<RubriqueEntrees titre="Explorer" titreId="t" entrees={entrees(5)} />);
    const items = screen.getAllByRole("listitem");
    expect(items[items.length - 1]).toHaveClass("last:odd:col-span-2");
    expect(items[items.length - 1]).toHaveClass("lg:last:odd:col-span-1");
  });
});
