import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp-oauth/metadata";

export function GET() {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
