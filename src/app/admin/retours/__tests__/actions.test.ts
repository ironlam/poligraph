import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthenticated = vi.fn();
vi.mock("@/lib/auth", () => ({ isAuthenticated }));
const findUnique = vi.fn();
const update = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { visitorFeedback: { findUnique, update }, auditLog: { create: auditCreate } },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { closeFeedback } = await import("../actions");

describe("closeFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthenticated.mockResolvedValue(true);
    findUnique.mockResolvedValue({ status: "NEW" });
  });

  it("refuse un appel sans session admin, sans toucher à la base", async () => {
    isAuthenticated.mockResolvedValue(false);
    await expect(closeFeedback("c1", "DONE")).rejects.toThrow("Non autorisé");
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
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

  it("refuse un statut hors DONE et REJECTED", async () => {
    // @ts-expect-error: un client malveillant peut envoyer n'importe quelle valeur
    await expect(closeFeedback("c1", "NEW")).rejects.toThrow("Statut invalide");
    expect(update).not.toHaveBeenCalled();
  });
});
