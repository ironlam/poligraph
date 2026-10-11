import { describe, it, expect, vi } from "vitest";

// The department list is static config: generateMetadata touches no database.
vi.mock("@/lib/db", () => ({ db: {} }));

import { generateMetadata } from "@/app/territoires/departements/[slug]/page";

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

describe("/territoires/departements/[slug] metadata", () => {
  it("noindex un département inexistant au lieu de l'offrir à l'indexation", async () => {
    const m = await metadataFor("x-bidon");

    expect(m.title).toBe("Département introuvable");
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("laisse intacte la metadata d'un département existant", async () => {
    const m = await metadataFor("loire");

    expect(m.title).toBe("Loire");
    expect(m.description).toContain("Loire");
    expect(m.alternates?.canonical).toBe("/territoires/departements/loire");
    expect(m.robots).toBeUndefined();
  });
});

describe("/territoires/departements/[slug] generateStaticParams", () => {
  it("pré-génère les vrais slugs, chacun résolu par la page", async () => {
    const { generateStaticParams } = await import("@/app/territoires/departements/[slug]/page");
    const { DEPARTMENTS, getDepartmentBySlug } = await import("@/config/departments");
    const params = generateStaticParams();

    expect(params).toHaveLength(Object.keys(DEPARTMENTS).length);
    for (const { slug } of params) expect(getDepartmentBySlug(slug), slug).not.toBeNull();
    expect(params).toContainEqual({ slug: "ille-et-vilaine" });
    expect(params).toContainEqual({ slug: "corse-du-sud" });
  });

  it("répond 404 hors de cette liste, y compris après la redirection depuis /departements", async () => {
    const page = await import("@/app/territoires/departements/[slug]/page");
    expect(page.dynamicParams).toBe(false);
  });
});
