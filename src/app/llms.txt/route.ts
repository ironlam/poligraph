import { buildLlmsTxt } from "@/lib/seo/llms-txt";

// Built from constants only: rendered once at build time and served from the CDN.
export const dynamic = "force-static";

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
