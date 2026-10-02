import { describe, it, expect } from "vitest";
import {
  POOL_EXHAUSTED_FINGERPRINT,
  createPoolExhaustionFilter,
  createReportGate,
  isPoolExhaustedError,
} from "../pool-exhaustion";

/** The shape logged on 2026-10-01: a DriverAdapterError whose cause carries the pg error. */
function driverAdapterError(): Error {
  const error = new Error("(EMAXCONN) max client connections reached, limit: 400");
  error.name = "DriverAdapterError";
  (error as Error & { cause: unknown }).cause = {
    kind: "postgres",
    code: "XX000",
    severity: "FATAL",
    message: "(EMAXCONN) max client connections reached, limit: 400",
  };
  return error;
}

describe("isPoolExhaustedError", () => {
  it("reconnaît l'erreur du driver telle que Prisma la lève", () => {
    expect(isPoolExhaustedError(driverAdapterError())).toBe(true);
  });

  it("la reconnaît aussi quand seule la cause porte le code", () => {
    const wrapped = new Error("Invalid `prisma.politician.findUnique()` invocation");
    (wrapped as Error & { cause: unknown }).cause = driverAdapterError();
    expect(isPoolExhaustedError(wrapped)).toBe(true);
  });

  it("ignore une autre erreur de base", () => {
    expect(isPoolExhaustedError(new Error("timeout exceeded when trying to connect"))).toBe(false);
    expect(isPoolExhaustedError(undefined)).toBe(false);
    expect(isPoolExhaustedError("EMAXCONN")).toBe(false);
  });
});

describe("createReportGate", () => {
  it("s'ouvre une fois par intervalle", () => {
    let t = 0;
    const gate = createReportGate(1_000, () => t);
    expect(gate()).toBe(true);
    t = 999;
    expect(gate()).toBe(false);
    t = 1_000;
    expect(gate()).toBe(true);
  });
});

describe("createPoolExhaustionFilter", () => {
  it("regroupe la saturation dans une seule issue, quelle que soit la route", () => {
    const filter = createPoolExhaustionFilter(() => true);
    const input: { tags?: Record<string, unknown>; fingerprint?: string[] } = {
      tags: { route: "/parlement" },
    };
    const event = filter(input, { originalException: driverAdapterError() });
    expect(event?.fingerprint).toEqual(POOL_EXHAUSTED_FINGERPRINT);
    expect(event?.tags).toEqual({ route: "/parlement", dbPool: "exhausted" });
  });

  it("n'envoie qu'un event par fenêtre, comme pendant une rafale de 573 erreurs", () => {
    let t = 0;
    const filter = createPoolExhaustionFilter(createReportGate(60_000, () => t));
    const sent = Array.from({ length: 573 }, (_, i) => {
      t = i * 500; // une erreur toutes les 500 ms, soit environ cinq minutes
      return filter({}, { originalException: driverAdapterError() });
    }).filter(Boolean);
    expect(sent).toHaveLength(5);
  });

  it("laisse passer les autres erreurs sans les toucher, même fenêtre fermée", () => {
    const filter = createPoolExhaustionFilter(() => false);
    const event = { tags: { a: 1 } };
    expect(filter(event, { originalException: new Error("boom") })).toBe(event);
    expect(event).toEqual({ tags: { a: 1 } });
  });
});
