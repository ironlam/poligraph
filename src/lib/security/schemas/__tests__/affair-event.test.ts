import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { AffairEventType } from "@/generated/prisma";
import { LEGACY_EVENT_TYPES } from "@/config/labels";
import { EVENT_TYPE_VALUES, eventDraftSchema, toDraftInput } from "../affair-event";

describe("affair-event schema", () => {
  it("accepte exactement les types Prisma non hérités", () => {
    const expected = Object.values(AffairEventType)
      .filter((t) => !LEGACY_EVENT_TYPES.includes(t))
      .sort();
    expect([...EVENT_TYPE_VALUES].sort()).toEqual(expected);
  });

  it("refuse une précision de fin différente", () => {
    const body = eventDraftSchema.parse({
      type: "PROCES",
      date: "2024-05",
      dateEnd: "2024-06-02",
      occurrence: "HELD",
      title: "Procès",
    });
    const r = toDraftInput(body);
    expect(r.ok).toBe(false);
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
