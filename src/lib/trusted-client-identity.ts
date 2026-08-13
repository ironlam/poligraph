import { isProductionRuntime } from "@/lib/ratelimit/degraded-mode";

export class TrustedClientIdentityError extends Error {}

function normalizeSingleAddress(value: string | null): string | null {
  if (!value || value.includes(",") || value.length > 128) return null;
  const normalized = value.trim();
  return normalized && !/[\s\u0000-\u001f]/.test(normalized) ? normalized : null;
}

export function resolveTrustedClientIdentity(request: Request): string {
  if (isProductionRuntime(process.env)) {
    const identity = normalizeSingleAddress(request.headers.get("x-vercel-forwarded-for"));
    if (!identity) throw new TrustedClientIdentityError("Trusted client identity unavailable");
    return identity;
  }

  return (
    normalizeSingleAddress(request.headers.get("x-vercel-forwarded-for")) ?? "local-development"
  );
}
