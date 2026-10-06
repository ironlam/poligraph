import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { AffairsSection } from "@/components/politicians/AffairsSection";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CERTAINTY_COLORS, CERTAINTY_LABELS } from "@/config/certainty";
import { AFFAIR_STATUS_LABELS } from "@/config/labels";
import {
  ATTRIBUTION_ROWS,
  type AttributionRow,
} from "@/lib/affairs/__tests__/fixtures/attribution";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function row(key: AttributionRow["key"]): AttributionRow {
  const found = ATTRIBUTION_ROWS.find((r) => r.key === key);
  if (!found) throw new Error(`Ligne de fixture absente : ${key}`);
  return found;
}

function affairFrom(key: AttributionRow["key"], title: string) {
  const { involvement, status, category } = row(key);
  return {
    id: key,
    slug: key,
    title,
    description: "Faits décrits par les sources.",
    status,
    category,
    involvement,
    involvementNote: null,
    factsDate: null,
    startDate: null,
    verdictDate: new Date("2024-01-15"),
    createdAt: new Date("2024-01-01"),
    partyAtTime: null,
    events: [],
    sources: [],
    linkedAffair: null,
    linkedBy: [],
    prisonMonths: 24,
    prisonFirmMonths: null,
    ineligibilityMonths: null,
    ineligibilityFirmMonths: null,
    fineAmount: null,
    communityService: null,
    otherSentence: null,
    sentence: "Deux ans de prison avec sursis",
  };
}

function renderProfile() {
  return render(
    <TooltipProvider>
      <AffairsSection
        affairs={[
          affairFrom("directPenalConvicted", "Affaire où il est mis en cause"),
          affairFrom("indirectWitnessConvicted", "Affaire où il est témoin"),
          affairFrom("mentionedOnlyConvicted", "Affaire où il est mentionné"),
        ]}
        civility="M"
      />
    </TooltipProvider>
  );
}

/** Le bloc d'une affaire dans une section : le plus proche ancêtre qui porte son titre seul. */
function entryOf(section: HTMLElement, title: string): HTMLElement {
  const link = within(section).getByRole("link", { name: title });
  let node: HTMLElement | null = link;
  while (node && node.parentElement && node.parentElement !== section) {
    const parent: HTMLElement = node.parentElement;
    if (parent.querySelectorAll("a[href^='/affaires/']").length > 1) break;
    node = parent;
  }
  return node!;
}

describe("AffairsSection : un témoin n'est jamais présenté comme mis en cause", () => {
  it("seule l'affaire DIRECT figure sous un niveau de certitude", () => {
    const { container } = renderProfile();
    const accusedCard = container.querySelector<HTMLElement>("#affaires")!;

    // L'en-tête du groupe ETABLI annonce une seule affaire.
    const groupBadge = within(accusedCard)
      .getAllByText(CERTAINTY_LABELS.ETABLI)
      .find((el) => el.className.includes(CERTAINTY_COLORS.ETABLI))!;
    expect(groupBadge.nextElementSibling?.textContent).toBe("(1)");
    expect(
      within(accusedCard).getByRole("link", { name: "Affaire où il est mis en cause" })
    ).toBeTruthy();
    expect(within(accusedCard).queryByRole("link", { name: "Affaire où il est témoin" })).toBe(
      null
    );
    expect(within(accusedCard).queryByRole("link", { name: "Affaire où il est mentionné" })).toBe(
      null
    );
  });

  it("l'affaire INDIRECT rejoint les mentions avec son rôle, sans badge ni peine attribuée", () => {
    const { container } = renderProfile();
    const accusedCard = container.querySelector<HTMLElement>("#affaires")!;
    const secondary = [...container.querySelectorAll<HTMLElement>("details")].find(
      (d) => !accusedCard.contains(d)
    )!;
    expect(secondary).toBeTruthy();

    const witness = entryOf(secondary, "Affaire où il est témoin");
    expect(within(witness).getByText("Témoin/Secondaire")).toBeTruthy();
    // Aucun badge de certitude à charge : aucune des couleurs de certitude n'apparaît.
    const badgeClasses = [...witness.querySelectorAll("*")].map((el) => el.getAttribute("class"));
    for (const colors of Object.values(CERTAINTY_COLORS)) {
      expect(badgeClasses.some((c) => c?.includes(colors))).toBe(false);
    }
    expect(witness.textContent).not.toContain("Deux ans de prison");

    const mention = entryOf(secondary, "Affaire où il est mentionné");
    expect(within(mention).getByText("Mentionné")).toBeTruthy();
  });
});

describe("AffairsSection : rôle des personnes liées et statut d'un tiers", () => {
  const linkedWitness = {
    id: "liee",
    slug: "affaire-liee",
    title: "Affaire liée",
    involvement: "INDIRECT",
    publicationStatus: "PUBLISHED",
    politician: { id: "autre", fullName: "Autre Élu", slug: "autre-elu" },
  };

  it.each([
    ["sous un niveau de certitude", "directPenalConvicted"],
    ["dans la section victime", "victimViolence"],
  ] as const)("« Implique également » donne le rôle de la personne liée %s", (_where, key) => {
    const { container } = render(
      <TooltipProvider>
        <AffairsSection
          affairs={[{ ...affairFrom(key, "Affaire principale"), linkedBy: [linkedWitness] }]}
          civility="M"
        />
      </TooltipProvider>
    );

    const sentence = [...container.querySelectorAll("p")].find((p) =>
      p.textContent?.includes("Autre Élu")
    )!;
    expect(sentence.textContent).toContain(
      "Implique également Autre Élu en tant que témoin/secondaire"
    );
  });

  it("une mention n'affiche pas le statut brut de l'affaire mais l'encart du tiers", () => {
    const { container } = renderProfile();
    const accusedCard = container.querySelector<HTMLElement>("#affaires")!;
    const secondary = [...container.querySelectorAll<HTMLElement>("details")].find(
      (d) => !accusedCard.contains(d)
    )!;

    for (const title of ["Affaire où il est témoin", "Affaire où il est mentionné"]) {
      const entry = entryOf(secondary, title);
      expect(entry.textContent).not.toContain(AFFAIR_STATUS_LABELS.CONDAMNATION_DEFINITIVE);
      expect(entry.querySelector("[role='note']")?.getAttribute("data-variant")).toBe(
        "third_party"
      );
    }
  });

  it("un témoin d'une procédure en cours reçoit l'encart « non mis en cause »", () => {
    const { container } = render(
      <TooltipProvider>
        <AffairsSection
          affairs={[
            {
              ...affairFrom("indirectWitnessConvicted", "Affaire en cours"),
              status: "INSTRUCTION",
            },
          ]}
          civility="M"
        />
      </TooltipProvider>
    );

    const note = container.querySelector("[role='note']");
    expect(note?.getAttribute("data-variant")).toBe("not_accused");
    expect(container.textContent).not.toContain(AFFAIR_STATUS_LABELS.INSTRUCTION);
  });
});
