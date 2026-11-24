import type { Metadata } from "next";
import { fetchClientMetadata } from "@/lib/api/oauth-client-metadata";
import { getAllowedClientHosts } from "@/lib/mcp-oauth/config";
import { validateAuthorizationRequest } from "@/lib/mcp-oauth/authorize";
import { ConsentForm } from "./ConsentForm";

export const metadata: Metadata = {
  title: "Autoriser une application",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FORWARDED_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function OAuthConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = Object.fromEntries(
    FORWARDED_PARAMS.map((key) => [key, first(raw[key])])
  ) as Record<(typeof FORWARDED_PARAMS)[number], string | null>;
  const validation = await validateAuthorizationRequest(params, (clientId) =>
    fetchClientMetadata(clientId, getAllowedClientHosts())
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <h1 className="text-2xl font-display font-bold">Autoriser une application</h1>
      {validation.ok ? (
        <ConsentForm
          params={params}
          clientHost={validation.request.clientHost}
          clientName={validation.request.clientName}
          redirectHost={new URL(validation.request.redirectUri).host}
        />
      ) : (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="font-medium">Demande refusée.</p>
          <p className="mt-1 text-muted-foreground">{validation.reason}</p>
        </div>
      )}
    </div>
  );
}
