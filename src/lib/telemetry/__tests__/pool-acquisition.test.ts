import { describe, it, expect } from "vitest";
import {
  SLOW_ACQUISITION_MS,
  classifyAcquisition,
  describeAcquisition,
  isSlowAcquisition,
  startLoopLagProbe,
} from "../pool-acquisition";
import { WEB_CONNECTION_TIMEOUT_MS } from "@/config/database";

describe("seuil de signalement", () => {
  /**
   * Le seuil doit rester sous le délai d'acquisition, sinon on n'observe que les échecs et jamais
   * les quasi-échecs qui les annoncent. C'est tout l'intérêt de la mesure.
   */
  it("se déclenche avant que la connexion n'abandonne, y compris sur le budget le plus court", () => {
    expect(SLOW_ACQUISITION_MS).toBeLessThan(WEB_CONNECTION_TIMEOUT_MS);
  });

  it("reste au-dessus de ce qu'une charge normale produit", () => {
    // Mesuré sur staging le 2026-09-22, pool max=4, requêtes courtes réelles :
    // 8 concurrents -> 481 ms, 16 -> 1086 ms, 32 -> 2294 ms.
    expect(SLOW_ACQUISITION_MS).toBeGreaterThan(1100);
  });

  it("ne signale rien d'une acquisition ordinaire", () => {
    expect(isSlowAcquisition(150)).toBe(false);
    expect(isSlowAcquisition(481)).toBe(false);
  });

  it("signale ce qui dépasse le seuil", () => {
    expect(isSlowAcquisition(SLOW_ACQUISITION_MS + 1)).toBe(true);
  });
});

describe("classifyAcquisition", () => {
  /** Pool plein : le caller a fait la queue pour un slot (pg-pool:216). */
  const FULL = { poolTotal: 4, poolMax: 4 };
  /** Pool avec de la place : une connexion neuve s'ouvrait (pg-pool:262), la forme de POLIGRAPH-1R. */
  const ROOM = { poolTotal: 1, poolMax: 4 };

  it("désigne la boucle quand son retard explique l'essentiel de l'attente", () => {
    expect(classifyAcquisition({ waitedMs: 4000, loopLagMs: 3800, ...ROOM })).toBe("event-loop");
    expect(classifyAcquisition({ waitedMs: 4000, loopLagMs: 3800, ...FULL })).toBe("event-loop");
  });

  /**
   * La distinction qui manquait au premier jet : une attente n'est pas « en amont » du seul fait
   * que la boucle va bien. Si le pool était plein, l'attente est la nôtre.
   */
  it("désigne notre propre file quand le pool était au plafond", () => {
    expect(classifyAcquisition({ waitedMs: 12_000, loopLagMs: 15, ...FULL })).toBe("pool-queue");
  });

  it("ne désigne l'amont que si le pool avait de la place, donc qu'une connexion s'ouvrait", () => {
    expect(classifyAcquisition({ waitedMs: 12_000, loopLagMs: 15, ...ROOM })).toBe("upstream");
  });

  it("refuse de trancher quand la boucle contribue sans expliquer", () => {
    expect(classifyAcquisition({ waitedMs: 4000, loopLagMs: 900, ...ROOM })).toBe("unclear");
  });

  it("ne désigne pas la boucle sur un retard élevé mais une attente plus élevée encore", () => {
    // 1,2 s de blocage n'explique pas 10 s d'attente.
    expect(classifyAcquisition({ waitedMs: 10_000, loopLagMs: 1200, ...ROOM })).toBe("unclear");
  });

  it("traite un retard au plancher de résolution comme une boucle saine", () => {
    // monitorEventLoopDelay ne descend pas sous sa résolution : 10 ms est le plancher, pas un retard.
    expect(classifyAcquisition({ waitedMs: 8000, loopLagMs: 10, ...ROOM })).toBe("upstream");
  });
});

describe("describeAcquisition", () => {
  it("porte les nombres, l'occupation du pool et le verdict, puisque c'est ce qu'on lira", () => {
    const line = describeAcquisition({ waitedMs: 12_000, loopLagMs: 15, poolTotal: 1, poolMax: 4 });
    expect(line).toContain("12000");
    expect(line).toContain("15");
    expect(line).toContain("1/4");
    expect(line).toContain("upstream");
  });

  it("nomme la boucle quand c'est elle", () => {
    expect(
      describeAcquisition({ waitedMs: 4000, loopLagMs: 3800, poolTotal: 1, poolMax: 4 })
    ).toContain("event-loop");
  });
});

function blockEventLoop(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* blocage volontaire */
  }
}

describe("startLoopLagProbe", () => {
  /**
   * Une sonde par acquisition, et non un histogramme de processus : un blocage survenu dix minutes
   * plus tôt ne doit pas être imputé à cette attente-ci, et deux acquisitions lentes simultanées
   * ne doivent pas se voler leur mesure.
   */
  it("ne rapporte rien quand la boucle n'a pas été bloquée", async () => {
    const probe = startLoopLagProbe();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(probe.stop()).toBeLessThan(80);
  });

  it("rapporte un blocage survenu pendant l'acquisition", async () => {
    const probe = startLoopLagProbe();
    await new Promise((resolve) => setTimeout(resolve, 60));
    blockEventLoop(300);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(probe.stop()).toBeGreaterThan(200);
  });

  it("n'impute pas à une sonde un blocage survenu avant son démarrage", async () => {
    blockEventLoop(300);
    const probe = startLoopLagProbe();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(probe.stop()).toBeLessThan(80);
  });

  it("ne mêle pas deux sondes concurrentes", async () => {
    const calme = startLoopLagProbe();
    const calmeResultat = new Promise<number>((resolve) => {
      setTimeout(() => resolve(calme.stop()), 80);
    });
    const agitee = startLoopLagProbe();
    await new Promise((resolve) => setTimeout(resolve, 120));
    blockEventLoop(300);
    await new Promise((resolve) => setTimeout(resolve, 120));
    // La première sonde s'est arrêtée avant le blocage, il ne doit pas la contaminer.
    expect(await calmeResultat).toBeLessThan(80);
    expect(agitee.stop()).toBeGreaterThan(200);
  });

  it("se laisse arrêter deux fois sans se plaindre", () => {
    const probe = startLoopLagProbe();
    expect(probe.stop()).toBe(probe.stop());
  });
});
