import { describe, expect, it } from "vitest";
import { FOOTER_SECTIONS } from "@/config/navigation";

describe("navigation : lien vers le serveur MCP", () => {
  it("figure dans la rubrique « Le projet » du pied de page, sans flag", () => {
    const links = FOOTER_SECTIONS.find((s) => s.title === "Le projet")?.links;
    expect(links).toContainEqual({
      href: "https://mcp.poligraph.fr",
      label: "Serveur MCP",
      external: true,
    });
  });
});
