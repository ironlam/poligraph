/**
 * The large model, pinned to a dated version. The `mistral-large-latest` alias moved on 2026-11-12
 * to a model that reasons before it answers: the reply came back as blocks, the reasoning counted
 * as output (seven times the tokens on a short title, 8 to 25 s a call) and used up `max_tokens`
 * before any answer was written. An alias can move again; a dated name cannot.
 */
export const MISTRAL_LARGE_MODEL = "mistral-large-2512";
