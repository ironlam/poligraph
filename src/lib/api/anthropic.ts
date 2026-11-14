import { safeJsonParse, safeJsonParseOrThrow } from "@/lib/api/safe-json";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return apiKey;
}

/**
 * A non-2xx response from the Messages API, with the pieces needed to tell a
 * billing outage apart from a transient failure or a malformed request. The
 * message keeps the historical `Anthropic API error <status>: <body>` shape so
 * existing logs and greps still match.
 */
export class AnthropicApiError extends Error {
  readonly status: number;
  /** `error.type` from the response body ("invalid_request_error", "rate_limit_error", ...). */
  readonly errorType: string | null;
  readonly body: string;

  constructor(status: number, body: string, errorType: string | null) {
    super(`Anthropic API error ${status}: ${body}`);
    this.name = "AnthropicApiError";
    this.status = status;
    this.errorType = errorType;
    this.body = body;
  }
}

/**
 * True only for "your credit balance is too low", which is an OPS failure (the
 * account needs a top-up), not a code failure. Every caller that degrades to a
 * safe default should still degrade, but this lets it say WHY, so a billing
 * outage doesn't read like a transient API blip.
 *
 * Deliberately narrow: a 400 `invalid_request_error` also covers genuine bad
 * requests (bad max_tokens, malformed schema), which must NOT be reported as a
 * billing problem.
 */
export function isInsufficientCreditError(err: unknown): boolean {
  if (!(err instanceof AnthropicApiError)) return false;
  if (err.status !== 400) return false;
  if (err.errorType !== "invalid_request_error") return false;
  return /credit\s+balance/i.test(err.body);
}

// One ALERT line per process, not one per call: a preflight run over 30 drafts
// would otherwise bury the signal under 30 identical lines.
let creditAlertEmitted = false;

/** Test seam only. */
export function __resetCreditAlertForTests(): void {
  creditAlertEmitted = false;
}

function parseErrorType(body: string): string | null {
  const parsed = safeJsonParse<{ error?: { type?: unknown } }>(body);
  if (!parsed.success) return null;
  const type = parsed.data?.error?.type;
  return typeof type === "string" ? type : null;
}

export interface AnthropicOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  tools?: unknown[];
  toolChoice?: unknown;
  /**
   * Call-site name used in the usage log. Without it a line is attributable to
   * a model but not to a feature, which is exactly the gap that makes a bill
   * unreadable.
   */
  label?: string;
  /**
   * Cache the static prefix (tools + system) with a 5-minute breakpoint.
   *
   * Render order is tools -> system -> messages, so a breakpoint on the system
   * block covers the tool schemas too. Reads bill at 0.1x the input rate and
   * the 5-minute write at 1.25x, so it pays from the second call onward.
   *
   * Only worth setting where the prefix clears the model's minimum cacheable
   * size: 1024 tokens on Sonnet, but 4096 on Haiku 4.5. Below the minimum the
   * marker is a silent no-op - no error, just no cache entry.
   */
  cachePrefix?: boolean;
  /**
   * Passed through to the API untouched. Opt-in per call site on purpose:
   * the accepted shapes differ by model, so a global value would 400 somewhere.
   *
   * Matters for cost on Claude Sonnet 5, where omitting this runs adaptive
   * thinking at effort `high` by default and bills the thinking tokens as
   * output - the opposite of what a cheaper per-token rate suggests. It also
   * eats into `maxTokens`, which can truncate a forced tool call.
   */
  thinking?: unknown;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicResponse {
  content: Array<{ type: string; text?: string; input?: unknown; name?: string }>;
  /**
   * Four separately-priced quantities, not two. Cache writes bill at 1.25x the
   * input rate (5-minute TTL) and reads at 0.1x, so a total that folds them
   * together cannot be converted back into money.
   */
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  stop_reason?: string;
}

export interface AnthropicUsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/**
 * Process-wide usage meter, mirroring `getMistralTokensUsed()` in
 * `@/lib/api/mistral`. The response already carried these numbers and the
 * wrapper discarded them, so no bill could be attributed to a feature and no
 * caching change could be verified. Kept per model AND per call-site label:
 * the two questions ("which model costs what" and "which feature costs what")
 * need different groupings.
 */
const usageByKey = new Map<string, AnthropicUsageTotals>();

function recordUsage(key: string, usage: NonNullable<AnthropicResponse["usage"]>): void {
  const t = usageByKey.get(key) ?? {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
  t.calls++;
  t.inputTokens += usage.input_tokens ?? 0;
  t.outputTokens += usage.output_tokens ?? 0;
  t.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
  t.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  usageByKey.set(key, t);
}

function logUsage(
  label: string,
  model: string,
  usage: NonNullable<AnthropicResponse["usage"]>
): void {
  // One structured, greppable line per call. `cache_read` staying at 0 across
  // a run is the signature of a cache that silently never fires.
  console.log(
    `[anthropic] usage site=${label} model=${model} ` +
      `in=${usage.input_tokens ?? 0} out=${usage.output_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} ` +
      `cache_read=${usage.cache_read_input_tokens ?? 0}`
  );
}

/** Totals per `<label>@<model>` since process start (or the last reset). */
export function getAnthropicUsage(): Record<string, AnthropicUsageTotals> {
  return Object.fromEntries(usageByKey);
}

export function resetAnthropicUsage(): void {
  usageByKey.clear();
}

export async function callAnthropic(
  messages: AnthropicMessage[],
  options: AnthropicOptions = {}
): Promise<AnthropicResponse> {
  const {
    model = "claude-sonnet-5",
    maxTokens = 2000,
    system,
    tools,
    toolChoice,
    label,
    cachePrefix = false,
    thinking,
  } = options;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (system) {
    // The breakpoint sits on the system block, which is rendered after the
    // tools, so one marker caches the whole static prefix.
    body.system = cachePrefix
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (thinking) body.thinking = thinking;

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    const error = new AnthropicApiError(response.status, errorText, parseErrorType(errorText));

    if (isInsufficientCreditError(error) && !creditAlertEmitted) {
      creditAlertEmitted = true;
      // Distinct, greppable label: every AI feature backed by this wrapper is
      // down until the account is topped up, and callers that fall back to a
      // safe default would otherwise hide that completely.
      console.error(
        "[anthropic] ALERT ANTHROPIC_CREDIT_EXHAUSTED : crédit API épuisé, " +
          "toutes les fonctionnalités IA sont dégradées jusqu'au rechargement " +
          "(Anthropic Console > Plans & Billing). " +
          `model=${model} status=${response.status}`
      );
    }

    throw error;
  }

  const json = (await response.json()) as AnthropicResponse;

  if (json.usage) {
    recordUsage(`${label ?? "unlabelled"}@${model}`, json.usage);
    logUsage(label ?? "unlabelled", model, json.usage);
  }

  return json;
}

export function extractToolUse(response: AnthropicResponse): unknown | null {
  const toolUse = response.content.find((c) => c.type === "tool_use");
  return toolUse?.input ?? null;
}

export function parseAnthropicJSON<T = unknown>(text: string): T {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();
  return safeJsonParseOrThrow<T>(cleaned);
}
