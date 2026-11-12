import { afterEach, describe, expect, it, vi } from "vitest";
import { createScrutinWriteGate } from "../scrutin-write-gate";

const BEFORE = "2026-11-12T05:00:00.000Z";
const AFTER = "2026-11-12T05:03:10.000Z";

function readerReturning(...values: (string | null | Error)[]) {
  const read = vi.fn();
  for (const value of values) {
    if (value instanceof Error) read.mockRejectedValueOnce(value);
    else read.mockResolvedValueOnce(value);
  }
  return read;
}

describe("createScrutinWriteGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ne signale aucune écriture quand le repère n'a pas bougé", async () => {
    const gate = createScrutinWriteGate(readerReturning(BEFORE, BEFORE));
    await gate.capture();
    expect(await gate.scrutinsWritten()).toBe(false);
  });

  it("signale une écriture quand un scrutin a été mis à jour entre-temps", async () => {
    const gate = createScrutinWriteGate(readerReturning(BEFORE, AFTER));
    await gate.capture();
    expect(await gate.scrutinsWritten()).toBe(true);
  });

  it("signale une écriture quand le premier scrutin arrive dans une table vide", async () => {
    const gate = createScrutinWriteGate(readerReturning(null, AFTER));
    await gate.capture();
    expect(await gate.scrutinsWritten()).toBe(true);
  });

  it("ne signale rien sur une table restée vide", async () => {
    const gate = createScrutinWriteGate(readerReturning(null, null));
    await gate.capture();
    expect(await gate.scrutinsWritten()).toBe(false);
  });

  it("purge par défaut quand le repère n'a jamais été relevé", async () => {
    const read = readerReturning(BEFORE);
    const gate = createScrutinWriteGate(read);
    expect(await gate.scrutinsWritten()).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("purge par défaut quand le relevé initial échoue, sans faire échouer l'étape", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const gate = createScrutinWriteGate(readerReturning(new Error("connection dropped"), BEFORE));
    await expect(gate.capture()).resolves.toBeUndefined();
    expect(await gate.scrutinsWritten()).toBe(true);
  });

  it("purge par défaut quand le second relevé échoue", async () => {
    const gate = createScrutinWriteGate(readerReturning(BEFORE, new Error("connection dropped")));
    await gate.capture();
    expect(await gate.scrutinsWritten()).toBe(true);
  });
});
