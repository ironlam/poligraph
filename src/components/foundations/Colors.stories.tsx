import type { Meta, StoryObj } from "@storybook/react";
import { cssVar, contrastRatio } from "./tokens";

const meta: Meta = {
  title: "Foundations/Colors",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 8 };

function Swatch({ token, label, note }: { token: string; label: string; note?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200 }}>
      <div
        aria-hidden="true"
        style={{
          height: 64,
          borderRadius: 8,
          background: `var(${token})`,
          border: "1px solid var(--border)",
        }}
      />
      <div style={{ fontWeight: 600 }}>{label}</div>
      <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{token}</code>
      <code style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{cssVar(token)}</code>
      {note ? <p style={{ fontSize: 12, margin: "2px 0 0" }}>{note}</p> : null}
    </div>
  );
}

// fg-on-bg sample + computed WCAG ratio and AA/AAA verdict (a11y, not colour alone).
function Pair({ fg, bg, label }: { fg: string; bg: string; label: string }) {
  const ratio = contrastRatio(`var(${fg})`, `var(${bg})`);
  const r = ratio ? Math.round(ratio * 100) / 100 : null;
  const verdict =
    r == null ? "" : r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA (grand texte)" : "insuffisant";
  return (
    <div style={{ width: 240 }}>
      <div
        style={{
          background: `var(${bg})`,
          color: `var(${fg})`,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13 }}>Texte d&apos;exemple lisible.</div>
      </div>
      <p style={{ fontSize: 12, margin: "6px 0 0" }}>
        Contraste {r ?? "?"}:1 <strong>{verdict}</strong>
      </p>
      <code style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
        {fg} / {bg}
      </code>
    </div>
  );
}

export const Marque: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Couleurs de marque</h2>
      <div style={row}>
        <Swatch
          token="--primary"
          label="Primary (bleu marine)"
          note="Identité : en-têtes, liens, accents."
        />
        <Swatch
          token="--brand"
          label="Brand / signal (rouge)"
          note="Signal UNIQUEMENT : alertes, condamnations. À ne pas confondre avec le rouge du logo (#ed2939)."
        />
      </div>
    </section>
  ),
};

export const Semantique: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Paires sémantiques (contraste)</h2>
      <div style={row}>
        <Pair fg="--foreground" bg="--background" label="Texte / fond" />
        <Pair fg="--card-foreground" bg="--card" label="Carte" />
        <Pair fg="--muted-foreground" bg="--muted" label="Atténué" />
        <Pair fg="--accent-foreground" bg="--accent" label="Accent" />
        <Pair fg="--primary-foreground" bg="--primary" label="Sur primary" />
        <Pair fg="--brand-foreground" bg="--brand" label="Sur signal" />
      </div>
      <h3 style={{ fontFamily: "var(--font-display)" }}>Bordures & focus</h3>
      <div style={row}>
        <Swatch token="--border" label="Bordure" />
        <Swatch token="--input" label="Champ" />
        <Swatch token="--ring" label="Anneau de focus" />
      </div>
    </section>
  ),
};

export const Neutres: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Échelle neutre</h2>
      <div style={row}>
        <Swatch token="--background" label="Background" />
        <Swatch token="--card" label="Card" />
        <Swatch token="--muted" label="Muted" />
        <Swatch token="--secondary" label="Secondary" />
        <Swatch token="--border" label="Border" />
        <Swatch token="--foreground" label="Foreground" />
      </div>
    </section>
  ),
};
