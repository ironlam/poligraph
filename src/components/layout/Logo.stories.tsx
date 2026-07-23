import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";
import { BRAND_NAVY, BRAND_RED, BRAND_PAGE } from "@/config/brand";

const meta: Meta<typeof Logo> = {
  title: "Foundations/Brand & Logo",
  component: Logo,
};
export default meta;
type Story = StoryObj<typeof Logo>;

export const Principal: Story = {
  render: () => (
    <div style={{ background: BRAND_PAGE, padding: 32 }}>
      <Logo size={64} withWordmark />
    </div>
  ),
};

export const SurFondMarine: Story = {
  render: () => (
    <div className="dark" style={{ background: BRAND_NAVY, padding: 32 }}>
      <Logo size={64} withWordmark />
    </div>
  ),
};

export const Tailles: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-end",
        background: BRAND_PAGE,
        padding: 32,
      }}
    >
      {[16, 24, 32, 40, 64].map((s) => (
        <div key={s} style={{ textAlign: "center" }}>
          <Logo size={s} />
          <div style={{ fontSize: 12, marginTop: 8 }}>{s}px</div>
        </div>
      ))}
    </div>
  ),
};

export const Palette: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      {[
        ["Navy", BRAND_NAVY],
        ["Rouge", BRAND_RED],
        ["Pages", BRAND_PAGE],
      ].map(([label, hex]) => (
        <div key={hex} style={{ textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: hex,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          />
          <div style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
          <code style={{ fontSize: 11 }}>{hex}</code>
        </div>
      ))}
    </div>
  ),
};

export const Attribution: Story = {
  render: () => (
    <p style={{ maxWidth: 520, fontSize: 14, lineHeight: 1.5 }}>
      Concept inspiré d&apos;une illustration d&apos;Adi Irawan (Vecteezy), puis redessiné pour
      Poligraph. Le rouge du logo (#ed2939) est une couleur de marque : il ne doit pas être confondu
      avec la couleur fonctionnelle « signal / danger » (--brand / --destructive) réservée aux
      alertes et condamnations.
    </p>
  ),
};

export const Monochrome: Story = {
  render: () => (
    <div
      style={{ display: "flex", gap: 24, alignItems: "center", background: "#fbfaf7", padding: 32 }}
    >
      <img src="/logo-mono.svg" alt="" width={72} height={72} />
      <p style={{ maxWidth: 42 + "ch", fontSize: 14, margin: 0 }}>
        Version monochrome (marine fixe), pour les usages à une seule couleur.
      </p>
    </div>
  ),
};
