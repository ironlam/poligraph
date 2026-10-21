import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthenticated = vi.fn();
vi.mock("@/lib/auth", () => ({ isAuthenticated }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 test" }),
}));

const findUnique = vi.fn();
const update = vi.fn();
const auditCreate = vi.fn();
const tx = { visitorFeedback: { findUnique, update }, auditLog: { create: auditCreate } };
const $transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
  callback(tx)
);
vi.mock("@/lib/db", () => ({ db: { $transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { closeFeedback } = await import("../actions");

describe("closeFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticated.mockResolvedValue(true);
    findUnique.mockResolvedValue({ status: "NEW" });
  });

  it("refuse un appel sans session admin, sans ouvrir de transaction", async () => {
    isAuthenticated.mockResolvedValue(false);
    await expect(closeFeedback("c1", "DONE")).rejects.toThrow("Non autorisé");
    expect($transaction).not.toHaveBeenCalled();
  });

  it("efface l'adresse e-mail à la clôture et journalise sans la recopier", async () => {
    await closeFeedback("c1", "DONE");

    expect(update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "DONE", resolvedAt: expect.any(Date), contactEmail: null },
    });
    const audit = auditCreate.mock.calls[0]![0].data;
    expect(audit.entityType).toBe("VisitorFeedback");
    expect(JSON.stringify(audit.changes)).not.toMatch(/@/);
  });

  it("inscrit l'IP et le user-agent de la requête dans l'audit", async () => {
    await closeFeedback("c1", "REJECTED");
    expect(auditCreate.mock.calls[0]![0].data).toMatchObject({
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 test",
    });
  });

  it("fait échouer la clôture quand l'audit échoue, pour que la transaction annule l'effacement", async () => {
    auditCreate.mockRejectedValueOnce(new Error("audit indisponible"));
    await expect(closeFeedback("c1", "DONE")).rejects.toThrow("audit indisponible");
    // L'écriture et l'audit passent par le même client de transaction : un rejet annule les deux.
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(update.mock.calls.length).toBe(1);
  });

  it("refuse un retour déjà clos et un retour introuvable", async () => {
    findUnique.mockResolvedValueOnce({ status: "DONE" });
    await expect(closeFeedback("c1", "REJECTED")).rejects.toThrow("Retour déjà clos");
    findUnique.mockResolvedValueOnce(null);
    await expect(closeFeedback("c2", "DONE")).rejects.toThrow("Retour introuvable");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuse un statut hors DONE et REJECTED", async () => {
    // @ts-expect-error: un client malveillant peut envoyer n'importe quelle valeur
    await expect(closeFeedback("c1", "NEW")).rejects.toThrow("Statut invalide");
    expect($transaction).not.toHaveBeenCalled();
  });
});
