import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "Foundations/Typography",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const PANGRAM = "Voix ambiguë d'un cœur qui, au zéphyr, préfère les jattes de kiwis.";

export const Familles: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Familles</h2>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28, margin: 0 }}>
          Outfit — display
        </p>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "4px 0 0" }}>
          {PANGRAM}
        </p>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          Titres et nombres. Poids 700 / 800. Token <code>--font-display</code>.
        </p>
      </div>
      <div>
        <p style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 20, margin: 0 }}>
          Atkinson Hyperlegible — corps
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 16, margin: "4px 0 0" }}>{PANGRAM}</p>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          Corps et UI, choisie pour la lisibilité des données civiques denses. Token{" "}
          <code>--font-body</code>.
        </p>
      </div>
    </section>
  ),
};

// The scale is a documented spec; the app applies it via Tailwind text-* utilities
// rather than exposed CSS vars, so specimens use literal px labelled with the token name.
export const Echelle: Story = {
  render: () => {
    const scale: [string, number, string][] = [
      ["text-xs", 12, "légal, légendes, badges"],
      ["text-sm", 14, "labels UI"],
      ["text-base", 16, "corps de lecture"],
      ["text-lg", 18, "titres de carte"],
      ["text-xl", 20, "logotype"],
      ["text-2xl", 24, "nombres KPI"],
      ["text-3xl", 30, "H1 de page"],
      ["text-4xl", 36, "H1 hero"],
    ];
    return (
      <section>
        <h2 style={{ fontFamily: "var(--font-display)" }}>Échelle typographique</h2>
        <dl style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {scale.map(([name, px, usage]) => (
            <div key={name} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <dt style={{ fontFamily: "var(--font-display)", fontSize: px }}>Poligraph</dt>
              <dd style={{ margin: 0 }}>
                <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {name} · {px}px
                </code>{" "}
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{usage}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    );
  },
};

export const Nombres: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Nombres (KPI)</h2>
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 36,
          fontVariantNumeric: "tabular-nums",
          margin: 0,
        }}
      >
        1 234 567
      </p>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
        Outfit 800, tabular-nums, format fr-FR (espace insécable comme séparateur de milliers).
      </p>
    </section>
  ),
};

export const PoidsInterlignage: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Poids & interlignage</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {(
          [
            ["400", "normal"],
            ["500", "medium"],
            ["600", "semibold"],
            ["700", "bold"],
            ["800", "extrabold"],
          ] as const
        ).map(([w, name]) => (
          <p key={w} style={{ margin: 0, fontWeight: Number(w) }}>
            {name} ({w}) — Poligraph, observatoire citoyen
          </p>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(
          [
            ["tight", 1.1],
            ["snug", 1.3],
            ["normal", 1.5],
            ["relaxed", 1.65],
          ] as const
        ).map(([name, val]) => (
          <p key={name} style={{ margin: 0, maxWidth: "60ch", lineHeight: val }}>
            <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              leading-{name} ({val})
            </code>{" "}
            — Poligraph recense les responsables politiques français, leurs votes, leurs
            déclarations et les affaires judiciaires, avec présomption d&apos;innocence et données
            sourcées.
          </p>
        ))}
      </div>
    </section>
  ),
};
