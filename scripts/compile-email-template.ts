/**
 * Pre-compiles MJML email templates to HTML for Vercel serverless compatibility.
 *
 * The `mjml` library uses `readFileSync` internally to load its component
 * definitions, which fails in Vercel serverless with EBADF. This script
 * compiles MJML to HTML at build time, producing a .ts module that can be
 * imported without any filesystem access at runtime.
 *
 * Usage:
 *   npx tsx scripts/compile-email-template.ts
 */

import mjml2html from "mjml";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TEMPLATE_DIR = join(__dirname, "../src/lib/email/templates");

interface TemplateConfig {
  input: string;
  output: string;
  exportName: string;
}

const TEMPLATES: TemplateConfig[] = [
  {
    input: "weekly-recap.mjml",
    output: "weekly-recap-compiled.ts",
    exportName: "WEEKLY_RECAP_HTML",
  },
  {
    input: "welcome.mjml",
    output: "welcome-compiled.ts",
    exportName: "WELCOME_HTML",
  },
  {
    input: "confirm-doi.mjml",
    output: "confirm-doi-compiled.ts",
    exportName: "CONFIRM_DOI_HTML",
  },
];

async function main() {
  for (const tpl of TEMPLATES) {
    const inputPath = join(TEMPLATE_DIR, tpl.input);
    const outputPath = join(TEMPLATE_DIR, tpl.output);

    let template = readFileSync(inputPath, "utf-8");

    // Wrap {{#if}}...{{/if}} in <mj-raw> so MJML preserves them as HTML comments
    template = template.replace(/^(\s*)\{\{#if (\w+)\}\}\s*$/gm, "$1<mj-raw><!--IF_$2--></mj-raw>");
    template = template.replace(/^(\s*)\{\{\/if\}\}\s*$/gm, "$1<mj-raw><!--/IF--></mj-raw>");

    // Wrap raw HTML placeholders ({{votesHtml}} etc.) inside <mj-column> with <mj-raw>
    template = template.replace(
      /<mj-column>\s*\{\{\s*(\w+Html)\s*\}\}\s*<\/mj-column>/g,
      "<mj-column><mj-raw>{{$1}}</mj-raw></mj-column>"
    );

    // mjml 5 returns a Promise. @types/mjml still declares the v4 synchronous
    // signature, so dropping the await compiles fine and yields undefined at
    // runtime: keep it.
    const { html, errors } = await mjml2html(template, {
      validationLevel: "soft",
      minify: false,
    });

    if (errors.length > 0) {
      console.warn(
        `MJML warnings for ${tpl.input}:`,
        errors.map((e) => e.formattedMessage)
      );
    }

    // Convert HTML comment conditionals back to handlebar-style
    let processed = html.replace(/<!--IF_(\w+)-->/g, "{{#if $1}}");
    processed = processed.replace(/<!--\/IF-->/g, "{{/if}}");

    // Force placeholders to the compact {{name}} form. mjml 5 reformats text
    // nodes and pads them into {{ name }}, which render-onboarding.ts and
    // render-confirm-doi.ts would stop matching (/\{\{deputyName\}\}/g), and
    // the email would ship the raw placeholder. This also compacts the ones
    // authored with spaces in the .mjml, which only render-recap.ts reads, via
    // a matcher that tolerates both.
    processed = processed.replace(/\{\{\s*(\w+)\s*\}\}/g, "{{$1}}");

    // Escape backticks for template literal
    const escaped = processed.replace(/`/g, "\\`").replace(/\$/g, "\\$");

    const output =
      `// Auto-generated from ${tpl.input} — do not edit manually\n` +
      "// Regenerate with: npx tsx scripts/compile-email-template.ts\n\n" +
      `export const ${tpl.exportName} = \`` +
      escaped +
      "`;\n";

    writeFileSync(outputPath, output);
    console.log(`Compiled ${inputPath} → ${outputPath} (${output.length} chars)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
