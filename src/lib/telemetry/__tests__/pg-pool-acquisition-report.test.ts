import { describe, it, expect, vi, afterEach } from "vitest";
import { reportSlowAcquisition } from "../pg-pool";
import { SLOW_ACQUISITION_MS } from "../pool-acquisition";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportSlowAcquisition", () => {
  it("se tait sur une acquisition ordinaire", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportSlowAcquisition(480, 5, 1, 4);
    expect(warn).not.toHaveBeenCalled();
  });

  it("signale au-delà du seuil, avec la durée et le verdict", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportSlowAcquisition(SLOW_ACQUISITION_MS + 4_000, 5, 1, 4);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("[pg-pool]");
    expect(line).toContain(String(SLOW_ACQUISITION_MS + 4_000));
    // Boucle saine (5 ms) et pool avec de la place : le verdict doit désigner l'amont.
    expect(line).toContain("1/4");
    expect(line).toContain("upstream");
  });

  it("ne tente aucune remontée Sentry hors runtime Next, comme dans un script batch", () => {
    // NEXT_RUNTIME est absent ici : la ligne console doit suffire et rien d'asynchrone ne doit
    // survivre au test, sinon un import encore en vol pollue la fin de suite.
    vi.stubEnv("NEXT_RUNTIME", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => reportSlowAcquisition(SLOW_ACQUISITION_MS + 1, 5, 1, 4)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
