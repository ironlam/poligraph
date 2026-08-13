import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "admin_session";
export const SESSION_DURATION = 12 * 60 * 60;

export type SessionAssurance = "unauthenticated" | "primary_authenticated" | "fully_authenticated";

export interface AdminSessionClaims {
  version: 1;
  keyId: string;
  epoch: number;
  issuedAt: number;
  expiresAt: number;
  assurance: SessionAssurance;
}

interface SessionKey {
  id: string;
  secret: string;
  issuedBefore?: number;
}

interface SessionConfig {
  epoch: number;
  current: SessionKey;
  previous?: SessionKey;
}

let highestObservedEpoch = -1;

function parseEpoch(value: string | undefined): number {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid session epoch");
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) throw new Error("Invalid session epoch");
  return epoch;
}

function parseSecret(value: string | undefined): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32) throw new Error("Invalid session secret");
  return value;
}

function parseKeyId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error("Invalid session key id");
  return value;
}

function readSessionConfig(): SessionConfig {
  const epoch = parseEpoch(process.env.ADMIN_SESSION_EPOCH);
  if (epoch < highestObservedEpoch) throw new Error("Session epoch rollback detected");
  highestObservedEpoch = epoch;

  const current = {
    id: parseKeyId(process.env.ADMIN_SESSION_KEY_ID),
    secret: parseSecret(process.env.ADMIN_SESSION_SECRET),
  };
  const previousValues = [
    process.env.ADMIN_SESSION_PREVIOUS_KEY_ID,
    process.env.ADMIN_SESSION_PREVIOUS_SECRET,
    process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE,
  ];
  const configuredPreviousValues = previousValues.filter(Boolean).length;
  if (configuredPreviousValues === 0) return { epoch, current };
  if (configuredPreviousValues !== previousValues.length) {
    throw new Error("Incomplete previous session key configuration");
  }

  const previousId = parseKeyId(process.env.ADMIN_SESSION_PREVIOUS_KEY_ID);
  if (previousId === current.id) throw new Error("Session key ids must be distinct");
  const issuedBefore = Date.parse(process.env.ADMIN_SESSION_PREVIOUS_ISSUED_BEFORE!);
  if (!Number.isFinite(issuedBefore)) throw new Error("Invalid previous session key cutoff");

  return {
    epoch,
    current,
    previous: {
      id: previousId,
      secret: parseSecret(process.env.ADMIN_SESSION_PREVIOUS_SECRET),
      issuedBefore,
    },
  };
}

function authenticate(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function signSessionToken(
  issuedAt = Date.now(),
  assurance: SessionAssurance = "fully_authenticated"
): string {
  const config = readSessionConfig();
  const claims: AdminSessionClaims = {
    version: 1,
    keyId: config.current.id,
    epoch: config.epoch,
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION * 1000,
    assurance,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", config.current.secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function validateSessionToken(token: string, now = Date.now()): AdminSessionClaims | null {
  try {
    const config = readSessionConfig();
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [payload, signature] = parts;
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<AdminSessionClaims>;
    if (
      claims.version !== 1 ||
      typeof claims.keyId !== "string" ||
      claims.epoch !== config.epoch ||
      !Number.isSafeInteger(claims.issuedAt) ||
      !Number.isSafeInteger(claims.expiresAt) ||
      !["unauthenticated", "primary_authenticated", "fully_authenticated"].includes(
        claims.assurance ?? ""
      )
    ) {
      return null;
    }
    if (
      claims.issuedAt! > now ||
      claims.expiresAt! !== claims.issuedAt! + SESSION_DURATION * 1000 ||
      now >= claims.expiresAt!
    ) {
      return null;
    }

    const key =
      claims.keyId === config.current.id
        ? config.current
        : claims.keyId === config.previous?.id
          ? config.previous
          : undefined;
    if (!key || (key.issuedBefore !== undefined && claims.issuedAt! >= key.issuedBefore))
      return null;
    if (!authenticate(payload, signature, key.secret)) return null;
    return claims as AdminSessionClaims;
  } catch {
    return null;
  }
}

export function getSessionAssurance(token: string): SessionAssurance {
  return validateSessionToken(token)?.assurance ?? "unauthenticated";
}

export function verifySessionToken(token: string): boolean {
  return getSessionAssurance(token) === "fully_authenticated";
}

export function resetSessionEpochHighWaterForTests(): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Test helper unavailable");
  highestObservedEpoch = -1;
}
