import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
import { createWithPublicId, isPublicIdCollision } from "../prisma-extension";

function collisionSur(champ: string) {
  return new Prisma.PrismaClientKnownRequestError("dup", {
    code: "P2002",
    clientVersion: "7",
    meta: { target: [champ] },
  });
}

/** Alloue en suivant la séquence, comme le fait `nextval`. */
function allocateur(depart: number) {
  let n = depart;
  return async () => `AF-${String(n++).padStart(6, "0")}`;
}

describe("isPublicIdCollision", () => {
  it("reconnaît une violation d'unicité sur publicId", () => {
    expect(isPublicIdCollision(collisionSur("publicId"))).toBe(true);
  });

  it("ignore une violation sur un autre champ", () => {
    expect(isPublicIdCollision(collisionSur("slug"))).toBe(false);
  });

  it("ignore une erreur qui n'est pas une violation d'unicité", () => {
    expect(isPublicIdCollision(new Error("boom"))).toBe(false);
  });
});

describe("createWithPublicId", () => {
  it("réessaie et franchit une valeur déjà prise", async () => {
    // Vécu : séquence à 575 pour un maximum réel de 576, donc le premier
    // nextval rend une valeur existante. Deux passes de production tuées.
    const query = vi
      .fn()
      .mockRejectedValueOnce(collisionSur("publicId"))
      .mockResolvedValueOnce({ id: "a1" });
    const args = { data: {} as { publicId?: string | null } };

    await expect(createWithPublicId(args, query, allocateur(576))).resolves.toEqual({ id: "a1" });

    expect(query).toHaveBeenCalledTimes(2);
    expect(args.data.publicId).toBe("AF-000577");
  });

  it("laisse remonter une violation sur un autre champ, sans réessayer", async () => {
    // Un slug en double ne se résout pas en avançant la séquence : réessayer
    // boucle sur une erreur permanente.
    const query = vi.fn().mockRejectedValue(collisionSur("slug"));

    await expect(createWithPublicId({ data: {} }, query, allocateur(1))).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("abandonne après la série bornée au lieu de boucler", async () => {
    const query = vi.fn().mockRejectedValue(collisionSur("publicId"));

    await expect(createWithPublicId({ data: {} }, query, allocateur(1), 3)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(4);
  });

  it("respecte un publicId fourni explicitement, sans allouer", async () => {
    const query = vi.fn().mockResolvedValue({ id: "a1" });
    const allocate = vi.fn();
    const args = { data: { publicId: "AF-000042" } };

    await createWithPublicId(args, query, allocate);

    expect(allocate).not.toHaveBeenCalled();
    expect(args.data.publicId).toBe("AF-000042");
  });
});
