import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AffairChronology, type PublicAffairEvent } from "@/components/affairs/AffairChronology";

const TODAY = new Date("2026-10-08T10:00:00Z");

let seq = 0;
function ev(overrides: Partial<PublicAffairEvent> = {}): PublicAffairEvent {
  seq += 1;
  return {
    id: `ev-${seq}`,
    status: "PUBLISHED",
    incidental: false,
    type: "AUTRE",
    date: new Date("2024-05-13T00:00:00Z"),
    datePrecision: "DAY",
    dateEnd: null,
    occurrence: "HELD",
    outcome: null,
    title: `Étape ${seq}`,
    court: null,
    description: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceKind: null,
    ...overrides,
  };
}

function dayEvents(n: number): PublicAffairEvent[] {
  return Array.from({ length: n }, (_, i) =>
    ev({ title: `Acte ${i + 1}`, date: new Date(Date.UTC(2020, 0, i + 1)) })
  );
}

function renderedSteps(container: HTMLElement) {
  return container.querySelectorAll("li[data-event-id]");
}

describe("AffairChronology", () => {
  it("n'affiche pas une étape non publiée, ni une étape sans statut", () => {
    const draft = ev({ status: "DRAFT", title: "Brouillon interne" });
    const noStatus = { ...ev({ title: "Sans statut" }) } as Partial<PublicAffairEvent>;
    delete noStatus.status;
    const published = ev({ title: "Étape publiée" });
    render(
      <AffairChronology
        events={[draft, noStatus as PublicAffairEvent, published]}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.queryByText("Brouillon interne")).toBeNull();
    expect(screen.queryByText("Sans statut")).toBeNull();
    expect(screen.getByText("Étape publiée")).toBeInTheDocument();
  });

  it("ne rend rien quand aucune étape n'est publiée", () => {
    const { container } = render(
      <AffairChronology
        events={[ev({ status: "DRAFT" })]}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("distingue trois marqueurs, masqués aux lecteurs d'écran avec un texte équivalent", () => {
    const { container } = render(
      <AffairChronology
        events={[
          ev({ type: "PERQUISITION", title: "Perquisition au domicile" }),
          ev({ type: "REVELATION", title: "Article de presse" }),
          ev({
            type: "PROCES",
            occurrence: "SCHEDULED",
            date: new Date("2027-03-16T00:00:00Z"),
            title: "Procès annoncé",
          }),
        ]}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    const markers = Array.from(container.querySelectorAll("[data-marker]"));
    expect(markers.map((m) => m.getAttribute("data-marker")).sort()).toEqual([
      "held",
      "revelation",
      "scheduled",
    ]);
    for (const m of markers) expect(m).toHaveAttribute("aria-hidden", "true");

    const scheduled = container.querySelector('[data-marker="scheduled"]')!;
    expect(scheduled.className).toContain("border-dashed");
    expect(scheduled.className).toContain("rounded-full");
    const revelation = container.querySelector('[data-marker="revelation"]')!;
    expect(revelation.className).not.toContain("rounded-full");
    const held = container.querySelector('[data-marker="held"]')!;
    expect(held.className).toContain("rounded-full");
    expect(held.className).not.toContain("border-dashed");

    const scheduledItem = scheduled.closest("li")!;
    expect(within(scheduledItem as HTMLElement).getByText("Étape annoncée")).toBeInTheDocument();
    const revelationItem = revelation.closest("li")!;
    expect(
      within(revelationItem as HTMLElement).getByText("Révélation médiatique")
    ).toBeInTheDocument();
  });

  it("une étape annoncée dont la date est passée reste non confirmée et n'alimente pas l'encart", () => {
    render(
      <AffairChronology
        events={[
          ev({
            type: "JUGEMENT",
            occurrence: "SCHEDULED",
            date: new Date("2026-06-01T00:00:00Z"),
            title: "Délibéré annoncé",
          }),
        ]}
        status="PROCES_EN_COURS"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText(/Prévu le 1er juin 2026, non confirmé à ce jour/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Prochaine étape annoncée" })).toBeNull();
  });

  it("affiche l'encart pour la première étape à venir, avec sa source", () => {
    render(
      <AffairChronology
        events={[
          ev({
            type: "PROCES_APPEL",
            occurrence: "SCHEDULED",
            date: new Date("2027-03-16T00:00:00Z"),
            title: "Procès en appel",
          }),
          ev({
            type: "JUGEMENT",
            occurrence: "SCHEDULED",
            date: new Date("2026-12-01T00:00:00Z"),
            title: "Jugement du tribunal correctionnel de Paris",
            sourceUrl: "https://www.example.gouv.fr/communique",
            sourceKind: "OFFICIAL",
            sourceTitle: null,
          }),
        ]}
        status="PROCES_EN_COURS"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    const box = screen.getByRole("region", { name: "Prochaine étape annoncée" });
    expect(
      within(box).getByText(/Jugement du tribunal correctionnel de Paris/)
    ).toBeInTheDocument();
    expect(within(box).getByText(/1er décembre 2026/)).toBeInTheDocument();
    expect(within(box).queryByText(/Procès en appel/)).toBeNull();
    const link = within(box).getByRole("link");
    expect(link).toHaveAttribute("href", "https://www.example.gouv.fr/communique");
    expect(link).toHaveTextContent("Source officielle");
    expect(link).toHaveTextContent("www.example.gouv.fr");
  });

  it("marque la phase courante avec aria-current", () => {
    render(
      <AffairChronology
        events={[
          ev({ type: "ENQUETE_PRELIMINAIRE", date: new Date("2020-01-01T00:00:00Z") }),
          ev({ type: "MISE_EN_EXAMEN", date: new Date("2021-01-01T00:00:00Z") }),
        ]}
        status="RENVOI_TRIBUNAL"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    const bar = screen.getByRole("list", { name: "Phases de la procédure" });
    const items = within(bar).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Enquête", "Instruction", "Jugement"]);
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
  });

  it("n'invente pas de phase Instruction pour une citation directe", () => {
    render(
      <AffairChronology
        events={[
          ev({ type: "PLAINTE", date: new Date("2022-01-01T00:00:00Z") }),
          ev({ type: "CONVOCATION_TRIBUNAL", date: new Date("2023-01-01T00:00:00Z") }),
        ]}
        status="PROCES_EN_COURS"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    const bar = screen.getByRole("list", { name: "Phases de la procédure" });
    expect(within(bar).queryByText("Instruction")).toBeNull();
    expect(within(bar).getByText("Jugement")).toBeInTheDocument();
  });

  it("masque la barre de phases quand il n'y a qu'une phase", () => {
    render(
      <AffairChronology
        events={[ev({ type: "PERQUISITION" })]}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.queryByRole("list", { name: "Phases de la procédure" })).toBeNull();
  });

  it("au delà de 8 étapes, montre la première et les 4 dernières puis déplie au clic", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AffairChronology
        events={dayEvents(10)}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(renderedSteps(container)).toHaveLength(5);
    expect(screen.getByText("Acte 1")).toBeInTheDocument();
    expect(screen.queryByText("Acte 2")).toBeNull();
    expect(screen.getByText("Acte 7")).toBeInTheDocument();
    expect(screen.getByText("Acte 10")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Afficher les 10 étapes" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.className).toContain("min-h-11");

    await user.click(button);
    expect(renderedSteps(container)).toHaveLength(10);
    const collapse = screen.getByRole("button", { name: "Réduire" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
  });

  it("jusqu'à 8 étapes, tout est affiché sans bouton", () => {
    const { container } = render(
      <AffairChronology
        events={dayEvents(8)}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(renderedSteps(container)).toHaveLength(8);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("affiche l'issue, la juridiction, la mention d'un recours incident et une source presse", () => {
    render(
      <AffairChronology
        events={[
          ev({
            type: "ARRET_CASSATION",
            incidental: true,
            outcome: "CASSATION_RENVOI",
            court: "Cour de cassation, chambre criminelle",
            sourceUrl: "https://journal.example.org/article",
            sourceKind: "PRESS",
            sourceTitle: "Le Journal",
          }),
        ]}
        status="MISE_EN_EXAMEN"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("Cassation avec renvoi")).toBeInTheDocument();
    expect(screen.getByText("Cour de cassation, chambre criminelle")).toBeInTheDocument();
    expect(screen.getByText(/recours sur un acte de procédure/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("Presse");
    expect(link).toHaveTextContent("Le Journal");
  });

  it("n'affiche pas de lien pour une URL de source non http", () => {
    render(
      <AffairChronology
        events={[ev({ sourceUrl: "javascript:alert(1)", sourceKind: "PRESS" })]}
        status="ENQUETE_PRELIMINAIRE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ne contient aucun tiret cadratin ni demi-cadratin", async () => {
    const user = userEvent.setup();
    const events = [
      ...dayEvents(9),
      ev({
        type: "FAITS",
        datePrecision: "YEAR",
        date: new Date("2012-01-01T00:00:00Z"),
        dateEnd: new Date("2014-01-01T00:00:00Z"),
      }),
      ev({ type: "REVELATION", datePrecision: "MONTH", date: new Date("2019-05-01T00:00:00Z") }),
      ev({
        type: "PROCES",
        occurrence: "SCHEDULED",
        date: new Date("2027-03-16T00:00:00Z"),
        sourceUrl: "https://a.example.org/x",
        sourceKind: "PRESS",
      }),
      ev({ type: "JUGEMENT", outcome: "RELAXE", incidental: true }),
    ];
    const { container } = render(
      <AffairChronology
        events={events}
        status="PROCES_EN_COURS"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(container.textContent).not.toMatch(/[—–]/);
    await user.click(screen.getByRole("button", { name: /Afficher les \d+ étapes/ }));
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("affiche l'issue quand la personne est mise en cause (M2)", () => {
    render(
      <AffairChronology
        events={[ev({ type: "JUGEMENT", outcome: "CONDAMNATION" })]}
        status="CONDAMNATION_PREMIERE_INSTANCE"
        today={TODAY}
        involvement="DIRECT"
      />
    );
    expect(screen.getByText("Condamnation")).toBeInTheDocument();
  });

  it.each(["INDIRECT", "VICTIM", "PLAINTIFF", "MENTIONED_ONLY"] as const)(
    "masque l'issue quand l'implication est %s (M2)",
    (involvement) => {
      render(
        <AffairChronology
          events={[ev({ type: "JUGEMENT", outcome: "CONDAMNATION", title: "Jugement rendu" })]}
          status="CONDAMNATION_PREMIERE_INSTANCE"
          today={TODAY}
          involvement={involvement}
        />
      );
      expect(screen.getByText("Jugement rendu")).toBeInTheDocument();
      expect(screen.queryByText("Condamnation")).toBeNull();
    }
  );
});
