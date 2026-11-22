/**
 * Turns X and Bluesky failures into a diagnostic a person can act on from a phone: which network,
 * what broke, what to do, and whether retrying the same request can succeed. Pure: the clients in
 * `@/lib/api/social-networks` hand over the raw error, nothing here talks to the network.
 */

export type SocialNetwork = "bluesky" | "x";

export type DiagnosticCode =
  | "MISSING_CONFIG"
  | "INVALID_CREDENTIALS"
  | "INSUFFICIENT_PERMISSIONS"
  | "CREDITS_DEPLETED"
  | "RATE_LIMITED"
  | "DUPLICATE_CONTENT"
  | "CONTENT_REJECTED"
  | "ACCOUNT_SUSPENDED"
  | "PROVIDER_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface SocialDiagnostic {
  reseau: SocialNetwork;
  code: DiagnosticCode;
  message: string;
  action: string;
  reessayable: boolean;
  /** Raw provider status and detail, kept short, for the cases the mapping does not cover. */
  detail?: string;
}

export class MissingSocialConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`Variables manquantes : ${variables.join(", ")}`);
    this.name = "MissingSocialConfigError";
  }
}

const NETWORK_LABEL: Record<SocialNetwork, string> = { bluesky: "Bluesky", x: "X" };

const ACTIONS: Record<DiagnosticCode, Record<SocialNetwork, string>> = {
  MISSING_CONFIG: {
    bluesky: "Ajouter BLUESKY_HANDLE et BLUESKY_APP_PASSWORD sur Vercel, puis redéployer.",
    x: "Ajouter les quatre variables TWITTER_* sur Vercel, puis redéployer.",
  },
  INVALID_CREDENTIALS: {
    bluesky:
      "Créer un nouveau mot de passe d'application (Paramètres > Confidentialité et sécurité > Mots de passe d'application), le mettre dans BLUESKY_APP_PASSWORD sur Vercel, puis redéployer.",
    x: "Régénérer les clés et l'access token dans la console développeur X, mettre à jour les quatre variables TWITTER_* sur Vercel, puis redéployer.",
  },
  INSUFFICIENT_PERMISSIONS: {
    bluesky: "Vérifier que le mot de passe d'application n'est pas restreint.",
    x: "Dans la console développeur X, passer l'app en « Read and write », puis régénérer l'access token (l'ancien garde les anciennes permissions).",
  },
  CREDITS_DEPLETED: {
    bluesky: "Sans objet sur Bluesky.",
    x: "Recharger les crédits dans la console développeur X (console.x.com).",
  },
  RATE_LIMITED: {
    bluesky: "Attendre la levée de la limite avant de republier.",
    x: "Attendre la levée de la limite avant de republier.",
  },
  DUPLICATE_CONTENT: {
    bluesky: "Reformuler le texte.",
    x: "X refuse un texte identique à un post récent : reformuler.",
  },
  CONTENT_REJECTED: {
    bluesky: "Corriger le texte (longueur, caractères) puis réessayer.",
    x: "Corriger le texte (longueur, caractères) puis réessayer.",
  },
  ACCOUNT_SUSPENDED: {
    bluesky: "Se connecter sur bsky.app pour voir l'état du compte.",
    x: "Se connecter sur x.com pour voir l'état du compte.",
  },
  PROVIDER_UNAVAILABLE: {
    bluesky: "Panne côté Bluesky : réessayer plus tard.",
    x: "Panne côté X : réessayer plus tard.",
  },
  NETWORK_ERROR: {
    bluesky: "Erreur réseau : réessayer dans quelques minutes.",
    x: "Erreur réseau : réessayer dans quelques minutes.",
  },
  UNKNOWN: {
    bluesky: "Lire le détail brut ci-joint.",
    x: "Lire le détail brut ci-joint.",
  },
};

const MESSAGES: Record<DiagnosticCode, string> = {
  MISSING_CONFIG: "configuration absente",
  INVALID_CREDENTIALS: "identifiants refusés, ils sont probablement révoqués ou expirés",
  INSUFFICIENT_PERMISSIONS: "identifiants valides mais sans le droit de publier",
  CREDITS_DEPLETED: "crédits API épuisés",
  RATE_LIMITED: "limite de requêtes atteinte",
  DUPLICATE_CONTENT: "contenu en double refusé",
  CONTENT_REJECTED: "texte refusé par le réseau",
  ACCOUNT_SUSPENDED: "compte suspendu ou désactivé",
  PROVIDER_UNAVAILABLE: "service indisponible",
  NETWORK_ERROR: "réseau injoignable",
  UNKNOWN: "erreur non reconnue",
};

const RETRYABLE: ReadonlySet<DiagnosticCode> = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NETWORK_ERROR",
]);

const DETAIL_MAX = 300;

export function buildDiagnostic(
  reseau: SocialNetwork,
  code: DiagnosticCode,
  extra: { detail?: string; resetAt?: Date } = {}
): SocialDiagnostic {
  let message = `${NETWORK_LABEL[reseau]} : ${MESSAGES[code]}`;
  if (code === "RATE_LIMITED" && extra.resetAt) {
    message += ` jusqu'à ${extra.resetAt.toLocaleTimeString("fr-FR", {
      timeZone: "Europe/Paris",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  const diagnostic: SocialDiagnostic = {
    reseau,
    code,
    message,
    action: ACTIONS[code][reseau],
    reessayable: RETRYABLE.has(code),
  };
  if (extra.detail) diagnostic.detail = extra.detail.slice(0, DETAIL_MAX);
  return diagnostic;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

/** Network failures surface as plain errors with a Node or undici code, never with an HTTP status. */
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function isNetworkFailure(error: Record<string, unknown> | null): boolean {
  const code = readString(error, "code") ?? readString(asRecord(error?.cause), "code");
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const name = readString(error, "name");
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * X errors come from twitter-api-v2: `ApiResponseError` carries the HTTP status in `code` and the
 * problem document (`title`, `detail`, `type`, `reason`) in `data`; `ApiRequestError` wraps a
 * transport failure. Pay-per-use answers 402 with type `.../problems/credits-depleted`.
 */
export function diagnoseXError(error: unknown): SocialDiagnostic {
  if (error instanceof MissingSocialConfigError) {
    return buildDiagnostic("x", "MISSING_CONFIG", { detail: error.message });
  }
  const record = asRecord(error);
  const status = readNumber(record, "code");
  const data = asRecord(record?.data);
  const problemType = readString(data, "type") ?? "";
  const detailText = [readString(data, "title"), readString(data, "detail")]
    .filter(Boolean)
    .join(" : ");
  const detail = status ? `HTTP ${status}${detailText ? ` ${detailText}` : ""}` : detailText;
  const lower = `${problemType} ${detailText} ${readString(data, "reason") ?? ""}`.toLowerCase();

  if (status === undefined) {
    if (readString(record, "type") === "request" || isNetworkFailure(record)) {
      return buildDiagnostic("x", "NETWORK_ERROR", { detail: readString(record, "message") });
    }
    return buildDiagnostic("x", "UNKNOWN", { detail: readString(record, "message") });
  }
  if (status === 401) return buildDiagnostic("x", "INVALID_CREDENTIALS", { detail });
  if (status === 402 || lower.includes("credits-depleted")) {
    return buildDiagnostic("x", "CREDITS_DEPLETED", { detail });
  }
  if (status === 429) {
    const rateLimit = asRecord(record?.rateLimit);
    const reset = readNumber(rateLimit, "reset");
    return buildDiagnostic("x", "RATE_LIMITED", {
      detail,
      resetAt: reset ? new Date(reset * 1000) : undefined,
    });
  }
  if (status === 403) {
    if (lower.includes("duplicate")) return buildDiagnostic("x", "DUPLICATE_CONTENT", { detail });
    if (lower.includes("suspended") || lower.includes("locked")) {
      return buildDiagnostic("x", "ACCOUNT_SUSPENDED", { detail });
    }
    return buildDiagnostic("x", "INSUFFICIENT_PERMISSIONS", { detail });
  }
  if (status === 400 || status === 422) {
    return buildDiagnostic("x", "CONTENT_REJECTED", { detail });
  }
  if (status >= 500) return buildDiagnostic("x", "PROVIDER_UNAVAILABLE", { detail });
  return buildDiagnostic("x", "UNKNOWN", { detail });
}

/**
 * Bluesky errors come from @atproto/xrpc: `XRPCError` carries `status` and the lexicon error name
 * in `error` ("AuthenticationRequired", "AccountTakedown", "RateLimitExceeded"...).
 */
export function diagnoseBlueskyError(error: unknown): SocialDiagnostic {
  if (error instanceof MissingSocialConfigError) {
    return buildDiagnostic("bluesky", "MISSING_CONFIG", { detail: error.message });
  }
  const record = asRecord(error);
  const status = readNumber(record, "status");
  const name = readString(record, "error") ?? "";
  const message = readString(record, "message") ?? "";
  const detail = [status ? `HTTP ${status}` : undefined, name, message].filter(Boolean).join(" ");

  if (name === "AccountTakedown" || name === "AccountDeactivated" || name === "AccountSuspended") {
    return buildDiagnostic("bluesky", "ACCOUNT_SUSPENDED", { detail });
  }
  if (status === 401 || name === "AuthenticationRequired" || name === "ExpiredToken") {
    return buildDiagnostic("bluesky", "INVALID_CREDENTIALS", { detail });
  }
  if (status === 403) return buildDiagnostic("bluesky", "INSUFFICIENT_PERMISSIONS", { detail });
  if (status === 429 || name === "RateLimitExceeded") {
    const headers = asRecord(record?.headers);
    const reset = Number(readString(headers, "ratelimit-reset"));
    return buildDiagnostic("bluesky", "RATE_LIMITED", {
      detail,
      resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : undefined,
    });
  }
  if (status === 400 || status === 413 || name === "InvalidRequest") {
    return buildDiagnostic("bluesky", "CONTENT_REJECTED", { detail });
  }
  if (status !== undefined && status >= 500) {
    return buildDiagnostic("bluesky", "PROVIDER_UNAVAILABLE", { detail });
  }
  // The xrpc client reports a request that never got a response as status 1 (ResponseType.Unknown).
  if (status === 1 || isNetworkFailure(record) || isNetworkFailure(asRecord(record?.cause))) {
    return buildDiagnostic("bluesky", "NETWORK_ERROR", { detail });
  }
  return buildDiagnostic("bluesky", "UNKNOWN", { detail });
}
