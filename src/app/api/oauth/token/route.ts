import { NextResponse } from "next/server";
import { OAuthConfigError } from "@/lib/mcp-oauth/config";
import { getOAuthKv } from "@/lib/mcp-oauth/store";
import { handleTokenRequest } from "@/lib/mcp-oauth/token-endpoint";

const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Corps application/x-www-form-urlencoded attendu.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const params = new URLSearchParams(await request.text());
    const response = await handleTokenRequest(params, { kv: getOAuthKv() });
    return NextResponse.json(response.body, { status: response.status, headers: NO_STORE });
  } catch (error) {
    if (error instanceof OAuthConfigError) {
      console.error("[oauth/token] configuration :", error.message);
    } else {
      console.error("[oauth/token]", error);
    }
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
