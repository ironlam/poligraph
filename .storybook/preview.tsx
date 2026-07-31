import type { Preview } from "storybook";
import type { Decorator } from "@storybook/react";
import "../src/app/globals.css";

// Wraps every story so the toolbar theme toggle re-scopes the design tokens.
// `.dark` in globals.css redefines the CSS custom properties for descendants.
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme === "dark" ? "dark" : "";
  return (
    <div
      className={theme}
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        padding: "1.5rem",
        minHeight: "100%",
      }}
    >
      <Story />
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "centered",
    a11y: {
      // The addon runs axe-core in the a11y panel for every story.
      // "todo" reports violations without failing; switch to "error"
      // once a Storybook test runner executes a11y checks in CI.
      test: "todo",
    },
  },
  globalTypes: {
    theme: {
      description: "Thème",
      toolbar: {
        title: "Thème",
        icon: "mirror",
        items: [
          { value: "light", title: "Clair" },
          { value: "dark", title: "Sombre" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [withTheme],
};

export default preview;
