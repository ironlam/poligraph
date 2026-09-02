import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_EMBEDDINGS_API_URL = "https://api.mistral.ai/v1/embeddings";

function getApiKey(): string {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY environment variable is not set");
  return apiKey;
}

export interface MistralOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  temperature?: number;
  responseFormat?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          description?: string;
          schema: Record<string, unknown>;
          strict?: boolean;
        };
      };
}

export interface MistralMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MistralResponse {
  model?: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface MistralEmbeddingResponse {
  model: string;
  data: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

export async function callMistralEmbeddings(
  inputs: string[],
  options: { model: string; signal?: AbortSignal }
): Promise<MistralEmbeddingResponse> {
  if (inputs.length === 0) throw new Error("Mistral embeddings requires at least one input");

  const response = await fetch(MISTRAL_EMBEDDINGS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    signal: options.signal,
    body: JSON.stringify({ model: options.model, input: inputs, encoding_format: "float" }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Mistral embeddings API error ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as MistralEmbeddingResponse;
  if (json.usage?.total_tokens) _mistralTokensUsed += json.usage.total_tokens;
  return json;
}

export async function callMistral(
  messages: MistralMessage[],
  options: MistralOptions = {}
): Promise<MistralResponse> {
  const {
    model = "mistral-large-latest",
    maxTokens = 2000,
    system,
    temperature,
    responseFormat,
  } = options;

  const allMessages: MistralMessage[] = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: allMessages,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (responseFormat) body.response_format = responseFormat;

  const response = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Mistral API error ${response.status}: ${errorText}`);
  }

  const json = (await response.json()) as MistralResponse;
  if (json.usage?.total_tokens) _mistralTokensUsed += json.usage.total_tokens;
  return json;
}

// Process-wide token meter. callMistral adds each response's total_tokens here so
// long batch jobs (e.g. the policy-title generation backfill) can track real cost
// and enforce a budget ceiling without threading usage through every caller.
let _mistralTokensUsed = 0;
export function getMistralTokensUsed(): number {
  return _mistralTokensUsed;
}
export function resetMistralTokensUsed(): void {
  _mistralTokensUsed = 0;
}

export function extractMistralText(response: MistralResponse): string {
  return response.choices[0]?.message.content ?? "";
}

export function parseMistralJSON<T = unknown>(text: string): T {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1]!.trim();
  return safeJsonParseOrThrow<T>(cleaned);
}
