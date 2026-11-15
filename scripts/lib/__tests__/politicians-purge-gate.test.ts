import { afterEach, describe, expect, it, vi } from "vitest";
import { createPoliticiansPurgeGate, MAX_AGE_MS, type PurgeState } from "../politicians-purge-gate";

const MARKER = "2026-11-15T10:00:00.000Z#5892|2026-11-15T10:00:00.000Z#640000|none#0";
const MOVED = "2026-11-15T17:40:00.000Z#5893|2026-11-15T10:00:00.000Z#640000|none#0";
const NOW = new Date("2026-11-15T18:00:00.000Z");

function gateWith(options: {
  marker?: string | Error;
  state?: PurgeState | null | Error;
  writeState?: (marker: string) => Promise<void>;
}) {
  const writeState = options.writeState ?? vi.fn(async () => undefined);
  const gate = createPoliticiansPurgeGate({
    readMarker: async () => {
      if (options.marker instanceof Error) throw options.marker;
      return options.marker ?? MARKER;
    },
    readState: async () => {
      if (options.state instanceof Error) throw options.state;
      return options.state === undefined ? null : options.state;
    },
    writeState,
    now: () => NOW,
  });
  return { gate, writeState };
}

const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe("createPoliticiansPurgeGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ne purge pas quand rien n'a bougé depuis une purge récente", async () => {
    const { gate } = gateWith({ state: { marker: MARKER, purgedAt: hoursAgo(6) } });
    expect((await gate.decide()).purge).toBe(false);
  });

  it("purge quand une fiche ou un mandat a changé depuis la dernière purge", async () => {
    const { gate } = gateWith({ marker: MOVED, state: { marker: MARKER, purgedAt: hoursAgo(6) } });
    expect((await gate.decide()).purge).toBe(true);
  });

  it("purge sur une suppression, que le compte de lignes révèle", async () => {
    const fewer = MARKER.replace("#5892", "#5891");
    const { gate } = gateWith({ marker: fewer, state: { marker: MARKER, purgedAt: hoursAgo(1) } });
    expect((await gate.decide()).purge).toBe(true);
  });

  it("purge au moins une fois par jour, même sans changement visible", async () => {
    const justUnder = new Date(NOW.getTime() - MAX_AGE_MS + 1);
    const atLimit = new Date(NOW.getTime() - MAX_AGE_MS);
    expect(
      (await gateWith({ state: { marker: MARKER, purgedAt: justUnder } }).gate.decide()).purge
    ).toBe(false);
    expect(
      (await gateWith({ state: { marker: MARKER, purgedAt: atLimit } }).gate.decide()).purge
    ).toBe(true);
  });

  it("purge quand aucune purge n'a encore été enregistrée", async () => {
    expect((await gateWith({ state: null }).gate.decide()).purge).toBe(true);
  });

  it("purge quand le repère ou l'état est illisible", async () => {
    expect((await gateWith({ marker: new Error("connexion") }).gate.decide()).purge).toBe(true);
    expect((await gateWith({ state: new Error("connexion") }).gate.decide()).purge).toBe(true);
  });

  it("enregistre le repère sur lequel la décision a été prise", async () => {
    const { gate, writeState } = gateWith({ marker: MOVED, state: null });
    await gate.decide();
    await gate.recordPurge();
    expect(writeState).toHaveBeenCalledExactlyOnceWith(MOVED);
  });

  it("n'enregistre rien tant qu'aucun repère n'a pu être lu", async () => {
    const { gate, writeState } = gateWith({ marker: new Error("connexion") });
    await gate.decide();
    await gate.recordPurge();
    expect(writeState).not.toHaveBeenCalled();
  });

  it("ne fait pas échouer la synchro si l'enregistrement échoue", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { gate } = gateWith({
      state: null,
      writeState: async () => {
        throw new Error("écriture refusée");
      },
    });
    await gate.decide();
    await expect(gate.recordPurge()).resolves.toBeUndefined();
  });
});
