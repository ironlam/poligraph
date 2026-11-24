/**
 * The large model, pinned to a dated version. The `mistral-large-latest` alias moved on 2026-11-12
 * to a model that reasons before it answers: the reply came back as blocks, the reasoning counted
 * as output (seven times the tokens on a short title, 8 to 25 s a call) and used up `max_tokens`
 * before any answer was written. An alias can move again; a dated name cannot.
 */
export const MISTRAL_LARGE_MODEL = "mistral-large-2512";

/**
 * The small model, pinned for the same reason. On 2026-11-22 `mistral-small-latest` pointed at this
 * version, which also carries the `magistral-small-latest` alias: pinning it changes nothing today
 * and keeps a future move of the alias from changing the theme classifiers silently.
 */
export const MISTRAL_SMALL_MODEL = "mistral-small-2603";
