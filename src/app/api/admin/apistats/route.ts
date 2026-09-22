import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { withAdminAuth } from "@/lib/api/with-admin-auth";
import { getUpstashCredentials } from "@/lib/ratelimit/upstash-credentials";

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;

function dayKeys(days: number): string[] {
  const keys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function addInto(total: Record<string, number>, hash: Record<string, unknown> | null): void {
  if (!hash) return;
  for (const [field, value] of Object.entries(hash)) {
    const count = Number(value);
    // A non-numeric field must not poison the whole window: NaN is contagious and
    // JSON.stringify turns it into null, which reads as "no traffic" instead of "bad data".
    if (!Number.isFinite(count)) continue;
    total[field] = (total[field] ?? 0) + count;
  }
}

export const GET = withAdminAuth(async (request) => {
  const credentials = getUpstashCredentials();
  if (!credentials) {
    return NextResponse.json(
      { error: "Compteurs indisponibles : Redis non configuré" },
      { status: 503 }
    );
  }

  const raw = parseInt(request.nextUrl.searchParams.get("days") || "7", 10);
  const days = Math.min(MAX_DAYS, Math.max(1, Number.isNaN(raw) ? 7 : raw));

  const redis = new Redis({ url: credentials.url, token: credentials.token });
  const routes: Record<string, number> = {};
  const clients: Record<string, number> = {};

  for (const day of dayKeys(days)) {
    addInto(routes, await redis.hgetall(`apistats:${day}`));
    addInto(clients, await redis.hgetall(`apistats:client:${day}`));
  }

  return NextResponse.json({ days, routes, clients });
});
