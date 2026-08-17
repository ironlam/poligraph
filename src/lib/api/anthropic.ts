import { safeJsonParseOrThrow } from "@/lib/api/safe-json";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

function getApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return apiKey;
}

export interface AnthropicOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
  tools?: unknown[];
  toolChoice?: unknown;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicResponse {
  content: Array<{ type: string; text?: string; input?: unknown; name?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

export async function callAnthropic(
  messages: AnthropicMessage[],
  options: AnthropicOptions = {}
): Promise<AnthropicResponse> {
  const {
    model = "claude-sonnet-4-5-20250929",
    maxTokens = 2000,
    system,
    tools,
    toolChoice,
  } = options;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

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
    throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
  }

  return response.json();
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
