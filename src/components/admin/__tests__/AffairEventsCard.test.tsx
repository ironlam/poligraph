import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AffairEventsCard, type SerializedAffairEvent } from "@/components/admin/AffairEventsCard";

function event(over: Partial<SerializedAffairEvent>): SerializedAffairEvent {
  return {
    id: "ev_1",
    type: "MISE_EN_EXAMEN",
    status: "DRAFT",
    date: "2024-03-15T00:00:00.000Z",
    datePrecision: "DAY",
    dateEnd: null,
    occurrence: "HELD",
    outcome: null,
    title: "Mise en examen pour détournement",
    court: null,
    description: null,
    sourceUrl: "https://www.lemonde.fr/article",
    sourceTitle: "Le Monde",
    sourceKind: "PRESS",
    incidental: false,
    corroborationUrl: null,
    retractionReason: null,
    ...over,
  };
}

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderCard = (events: SerializedAffairEvent[]) =>
  render(<AffairEventsCard affairId="aff_1" events={events} />);

describe("AffairEventsCard", () => {
  it("affiche les trois statuts", () => {
    renderCard([
      event({ id: "a", status: "DRAFT" }),
      event({ id: "b", status: "PUBLISHED" }),
      event({ id: "c", status: "RETRACTED", retractionReason: "Source erronée" }),
    ]);
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByText("Publiée")).toBeInTheDocument();
    expect(screen.getByText("Retirée")).toBeInTheDocument();
    expect(screen.getByText(/Source erronée/)).toBeInTheDocument();
  });

  it("dit qu'aucune étape n'est saisie", () => {
    renderCard([]);
    expect(screen.getByText("Aucune étape saisie.")).toBeInTheDocument();
  });

  it("« Publier » envoie l'action PUBLISH puis rafraîchit", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { eventId: "ev_1" }));
    renderCard([event({})]);
    await userEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/affaires/aff_1/etapes/ev_1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "PUBLISH" }) })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("un 422 affiche l'erreur et ses raisons telles quelles", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: "Étape non publiable",
        reasons: ["La source est obligatoire.", "Le titre est obligatoire."],
      })
    );
    renderCard([event({})]);
    await userEvent.click(screen.getByRole("button", { name: "Publier" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Étape non publiable");
    expect(within(alert).getByText("La source est obligatoire.")).toBeInTheDocument();
    expect(within(alert).getByText("Le titre est obligatoire.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("montre les manques du garde sous un brouillon", () => {
    renderCard([event({ sourceUrl: null, sourceKind: null })]);
    expect(screen.getByText("La source est obligatoire.")).toBeInTheDocument();
  });

  it("« Retirer » ne part pas sans raison, puis envoie la raison", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { eventId: "ev_1" }));
    renderCard([event({ status: "PUBLISHED" })]);
    await userEvent.click(screen.getByRole("button", { name: "Retirer…" }));
    const send = screen.getByRole("button", { name: "Confirmer le retrait" });
    await userEvent.click(send);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Raison du retrait/), "Source erronée");
    await userEvent.click(send);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/affaires/aff_1/etapes/ev_1",
      expect.objectContaining({
        body: JSON.stringify({ action: "RETRACT", reason: "Source erronée" }),
      })
    );
  });

  it("« Confirmer la tenue » attend la date annoncée", () => {
    renderCard([
      event({
        id: "future",
        status: "PUBLISHED",
        type: "JUGEMENT",
        occurrence: "SCHEDULED",
        date: "2999-01-15T00:00:00.000Z",
      }),
    ]);
    expect(screen.queryByRole("button", { name: "Confirmer la tenue…" })).toBeNull();
  });

  it("« Confirmer la tenue » n'apparaît que sur une étape publiée et annoncée", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { eventId: "ev_1" }));
    renderCard([
      event({ id: "held", status: "PUBLISHED" }),
      event({ id: "sched", status: "PUBLISHED", type: "JUGEMENT", occurrence: "SCHEDULED" }),
    ]);
    const buttons = screen.getAllByRole("button", { name: "Confirmer la tenue…" });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    await userEvent.type(
      screen.getByLabelText("Nouvelle source (URL)"),
      "https://www.legifrance.gouv.fr/x"
    );
    await userEvent.selectOptions(screen.getByLabelText("Nature de la source"), "OFFICIAL");
    await userEvent.selectOptions(screen.getByLabelText("Issue"), "RELAXE");
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/affaires/aff_1/etapes/sched",
      expect.objectContaining({
        body: JSON.stringify({
          action: "CONFIRM",
          sourceUrl: "https://www.legifrance.gouv.fr/x",
          sourceTitle: null,
          sourceKind: "OFFICIAL",
          outcome: "RELAXE",
          corroborationUrl: null,
        }),
      })
    );
  });

  describe("formulaire d'ajout", () => {
    async function openForm() {
      renderCard([]);
      await userEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    }

    it("n'offre pas les types anciens", async () => {
      await openForm();
      const select = screen.getByLabelText("Type");
      const values = within(select)
        .getAllByRole("option")
        .map((o) => (o as HTMLOptionElement).value);
      expect(values).toContain("JUGEMENT");
      expect(values).not.toContain("CONDAMNATION");
      expect(values).not.toContain("RELAXE");
      expect(values).not.toContain("ACQUITTEMENT");
    });

    it("ne montre « Issue » que pour un jugement ou un arrêt tenu", async () => {
      await openForm();
      const type = screen.getByLabelText("Type");
      for (const t of ["JUGEMENT", "ARRET_APPEL", "ARRET_CASSATION"]) {
        await userEvent.selectOptions(type, t);
        expect(screen.getByLabelText("Issue")).toBeInTheDocument();
      }
      for (const t of ["PROCES", "APPEL", "MISE_EN_EXAMEN", "FAITS"]) {
        await userEvent.selectOptions(type, t);
        expect(screen.queryByLabelText("Issue")).not.toBeInTheDocument();
      }
      await userEvent.selectOptions(type, "JUGEMENT");
      await userEvent.click(screen.getByLabelText("Annoncée"));
      expect(screen.queryByLabelText("Issue")).not.toBeInTheDocument();
    });

    it("propose les issues propres à la cassation", async () => {
      await openForm();
      await userEvent.selectOptions(screen.getByLabelText("Type"), "ARRET_CASSATION");
      const values = within(screen.getByLabelText("Issue"))
        .getAllByRole("option")
        .map((o) => (o as HTMLOptionElement).value);
      expect(values).toContain("REJET_POURVOI");
      expect(values).not.toContain("CONDAMNATION");
    });

    it("ne montre la case de recours incident que pour les voies de recours", async () => {
      await openForm();
      const type = screen.getByLabelText("Type");
      await userEvent.selectOptions(type, "APPEL");
      expect(screen.getByLabelText(/Recours sur un acte de procédure/)).toBeInTheDocument();
      await userEvent.selectOptions(type, "JUGEMENT");
      expect(screen.queryByLabelText(/Recours sur un acte de procédure/)).not.toBeInTheDocument();
    });

    it("demande une seconde source pour une condamnation sourcée par la presse", async () => {
      await openForm();
      await userEvent.selectOptions(screen.getByLabelText("Type"), "JUGEMENT");
      await userEvent.selectOptions(screen.getByLabelText("Issue"), "CONDAMNATION");
      await userEvent.selectOptions(screen.getByLabelText("Nature de la source"), "OFFICIAL");
      expect(screen.queryByLabelText(/Seconde source/)).not.toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText("Nature de la source"), "PRESS");
      expect(screen.getByLabelText(/Seconde source/)).toBeInTheDocument();
      expect(
        screen.getByText("Deux médias indépendants, pas deux reprises de la même dépêche.")
      ).toBeInTheDocument();
    });

    it("ne montre la fin de période que pour les faits", async () => {
      await openForm();
      await userEvent.selectOptions(screen.getByLabelText("Type"), "PLAINTE");
      expect(screen.queryByLabelText(/Fin de période/)).not.toBeInTheDocument();
      await userEvent.selectOptions(screen.getByLabelText("Type"), "FAITS");
      expect(screen.getByLabelText(/Fin de période/)).toBeInTheDocument();
    });

    it("envoie la date au format de sa précision", async () => {
      fetchMock.mockResolvedValue(jsonResponse(201, { eventId: "ev_new" }));
      await openForm();
      await userEvent.selectOptions(screen.getByLabelText("Type"), "PLAINTE");
      await userEvent.selectOptions(screen.getByLabelText("Précision de la date"), "YEAR");
      await userEvent.type(screen.getByLabelText("Année"), "2021");
      await userEvent.type(screen.getByLabelText("Titre"), "Plainte de l'association");
      await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("/api/admin/affaires/aff_1/etapes");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        type: "PLAINTE",
        date: "2021",
        dateEnd: null,
        occurrence: "HELD",
        outcome: null,
        title: "Plainte de l'association",
        sourceKind: null,
        incidental: false,
        corroborationUrl: null,
      });
      expect(body).not.toHaveProperty("requestKey");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("« Modifier » préremplit le brouillon et envoie un PATCH", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { eventId: "ev_1" }));
    renderCard([event({ datePrecision: "MONTH", date: "2024-03-01T00:00:00.000Z" })]);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    expect(screen.getByLabelText("Précision de la date")).toHaveValue("MONTH");
    expect(screen.getByLabelText("Mois")).toHaveValue("2024-03");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/affaires/aff_1/etapes/ev_1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toMatchObject({ date: "2024-03", type: "MISE_EN_EXAMEN" });
  });

  it("« Supprimer » envoie un DELETE après confirmation", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { eventId: "ev_1" }));
    vi.stubGlobal("confirm", () => true);
    renderCard([event({})]);
    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/affaires/aff_1/etapes/ev_1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("signale une étape tenue datée dans le futur (H1)", () => {
    renderCard([event({ date: "2099-01-15T00:00:00.000Z" })]);
    expect(
      screen.getByText(
        "Une étape tenue ne peut pas être datée dans le futur : la marquer comme annoncée."
      )
    ).toBeInTheDocument();
  });

  it("préremplit la date en UTC, quel que soit le fuseau du navigateur (M4)", async () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      renderCard([event({ date: "2024-03-01T00:00:00.000Z" })]);
      await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
      expect(screen.getByLabelText("Jour")).toHaveValue("2024-03-01");
      await userEvent.selectOptions(screen.getByLabelText("Précision de la date"), "MONTH");
      expect(screen.getByLabelText("Mois")).toHaveValue("2024-03");
    } finally {
      process.env.TZ = previousTz;
    }
  });

  it("indique le format attendu des champs mois et année (L14)", async () => {
    renderCard([event({ datePrecision: "MONTH", date: "2024-03-01T00:00:00.000Z" })]);
    await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
    const month = screen.getByLabelText("Mois");
    expect(month).toHaveAttribute("placeholder", "AAAA-MM");
    expect(month).toHaveAttribute("pattern", "\\d{4}-\\d{2}");
    await userEvent.selectOptions(screen.getByLabelText("Précision de la date"), "YEAR");
    expect(screen.getByLabelText("Année")).toHaveAttribute("placeholder", "AAAA");
  });
});
