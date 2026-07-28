import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "Foundations/Spacing",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

// The 4px scale is a documented spec applied via Tailwind spacing utilities;
// specimens use literal px labelled with the token name.
export const Echelle: Story = {
  render: () => {
    const steps: [string, number][] = [
      ["space-1", 4],
      ["space-2", 8],
      ["space-3", 12],
      ["space-4", 16],
      ["space-6", 24],
      ["space-8", 32],
      ["space-10", 40],
      ["space-12", 48],
      ["space-16", 64],
    ];
    return (
      <section>
        <h2 style={{ fontFamily: "var(--font-display)" }}>
          Échelle d&apos;espacement (grille 4px)
        </h2>
        <dl style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map(([name, px]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <dd style={{ margin: 0 }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "block",
                    width: px,
                    height: 16,
                    background: "var(--primary)",
                    borderRadius: 2,
                  }}
                />
              </dd>
              <dt>
                <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {name} · {px}px
                </code>
              </dt>
            </div>
          ))}
        </dl>
      </section>
    );
  },
};

export const Rayons: Story = {
  render: () => {
    // --radius-sm/md/lg/xl exist in globals.css; "full" is a documented pill radius.
    const radii: [string, string][] = [
      ["--radius-sm", "var(--radius-sm)"],
      ["--radius-md", "var(--radius-md)"],
      ["--radius-lg", "var(--radius-lg)"],
      ["--radius-xl", "var(--radius-xl)"],
      ["radius-full", "9999px"],
    ];
    return (
      <section>
        <h2 style={{ fontFamily: "var(--font-display)" }}>Rayons</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {radii.map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                aria-hidden="true"
                style={{
                  width: 72,
                  height: 72,
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  borderRadius: value,
                }}
              />
              <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</code>
            </div>
          ))}
        </div>
      </section>
    );
  },
};

export const Elevation: Story = {
  render: () => {
    // Documented shadow scale (design system); applied as literals so the specimen
    // does not depend on which Tailwind shadow utilities are generated.
    const shadows: [string, string][] = [
      ["shadow-xs", "0 1px 2px 0 rgb(0 0 0 / 0.05)"],
      ["shadow-sm", "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)"],
      ["shadow-md", "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"],
      ["shadow-xl", "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"],
    ];
    return (
      <section>
        <h2 style={{ fontFamily: "var(--font-display)" }}>Élévation</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
          {shadows.map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                aria-hidden="true"
                style={{
                  width: 96,
                  height: 72,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: value,
                }}
              />
              <code style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</code>
            </div>
          ))}
        </div>
      </section>
    );
  },
};
