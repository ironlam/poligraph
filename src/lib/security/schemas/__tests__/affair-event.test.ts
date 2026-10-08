import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { AffairEventType } from "@/generated/prisma";
import { LEGACY_EVENT_TYPES } from "@/config/labels";
import { EVENT_TYPE_VALUES, eventDraftSchema } from "../affair-event";

describe("affair-event schema", () => {
  it("accepte exactement les types Prisma non hérités", () => {
    const expected = Object.values(AffairEventType)
      .filter((t) => !LEGACY_EVENT_TYPES.includes(t))
      .sort();
    expect([...EVENT_TYPE_VALUES].sort()).toEqual(expected);
  });

  it("refuse une précision de fin différente", () => {
    const r = eventDraftSchema.safeParse({
      type: "FAITS",
      date: "2024-05",
      dateEnd: "2024-06-02",
      occurrence: "HELD",
      title: "Faits",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["dateEnd"]);
  });

  it("refuse une date impossible avec un message en français", () => {
    const r = eventDraftSchema.safeParse({
      type: "PROCES",
      date: "2026-02-30",
      occurrence: "HELD",
      title: "Procès",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/^Date invalide/);
  });

  it("convertit la date et sa précision pour le service", () => {
    const input = eventDraftSchema.parse({
      type: "MISE_EN_EXAMEN",
      date: "2024-05",
      occurrence: "HELD",
      title: "Mise en examen",
    });
    expect(input.date).toEqual(new Date("2024-05-01T00:00:00Z"));
    expect(input.datePrecision).toBe("MONTH");
    expect(input.dateEnd).toBeNull();
  });

  it("transforme les chaînes vides en null", () => {
    const body = eventDraftSchema.parse({
      type: "PROCES",
      date: "2024",
      occurrence: "HELD",
      title: "  Procès  ",
      court: "  ",
      sourceUrl: "",
    });
    expect(body.title).toBe("Procès");
    expect(body.court).toBeNull();
    expect(body.sourceUrl).toBeNull();
  });
});
