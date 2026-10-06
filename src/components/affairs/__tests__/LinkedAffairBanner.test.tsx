import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LinkedAffairBanner } from "../LinkedAffairBanner";

describe("LinkedAffairBanner", () => {
  it("nomme la personne liée avec son rôle, accents compris", () => {
    const { container } = render(
      <LinkedAffairBanner
        linked={{
          slug: "affaire-liee",
          title: "Affaire liée",
          involvement: "INDIRECT",
          politician: { fullName: "Autre Élu", slug: "autre-elu" },
        }}
      />
    );

    expect(container.textContent).toContain(
      "Cette affaire implique également Autre Élu en tant que témoin/secondaire"
    );
  });
});
