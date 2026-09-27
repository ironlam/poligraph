import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfoTooltip } from "../info-tooltip";
import { TooltipProvider } from "../tooltip";

describe("InfoTooltip : nom accessible", () => {
  it("lit le libellé fourni plutôt que la clé du glossaire", () => {
    render(
      <TooltipProvider>
        <InfoTooltip term="serieSenatoriale" label="série sénatoriale" />
      </TooltipProvider>
    );
    expect(screen.getByRole("button", { name: "Aide : série sénatoriale" })).toBeInTheDocument();
  });

  it("garde l'ancien libellé quand aucun n'est fourni", () => {
    render(
      <TooltipProvider>
        <InfoTooltip term="serieSenatoriale" />
      </TooltipProvider>
    );
    expect(screen.getByRole("button", { name: "Aide : serieSenatoriale" })).toBeInTheDocument();
  });
});
