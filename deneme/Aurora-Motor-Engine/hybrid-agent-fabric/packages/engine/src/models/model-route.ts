/**
 * The canonical `provider:model` identity.
 *
 * Before this existed the format was re-implemented at eighteen sites with
 * three *incompatible* policies, which is the actual cost of not having one:
 *
 *   - `model-router.ts` split on the first colon with no validation, so a bare
 *     Bedrock inference-profile id such as `anthropic.claude-v2:0` parsed as
 *     provider `anthropic.claude-v2`, model `0`.
 *   - `agent-profile-registry.ts` validated strictly and *threw* on that same
 *     string.
 *   - six provider files stripped the prefix with `includes(":") ? slice(...) :
 *     fallback` and no guard at all.
 *
 * One string was therefore a valid route in one module, a misparse in another
 * and an error in a third. Nothing crashed; calls simply went to the wrong
 * model, or fell back to the provider default while the log still claimed a
 * route had been selected.
 *
 * The rule this module settles: **a colon alone does not make a route.** The
 * part before the first colon must look like a provider id — lowercase
 * alphanumerics and hyphens, which is what every registered provider actually
 * uses (`aws-bedrock`, `azure-openai`, `qwen-local`). A dot disqualifies it, so
 * a bare model id that happens to contain a colon is returned untouched instead
 * of being cut in half.
 */

/** Longest route we accept; longer input is treated as not a route. */
export const MAX_MODEL_ROUTE_LENGTH = 300;

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/i;

export interface ModelRouteParts {
  readonly provider: string;
  readonly model: string;
}

/** Builds the canonical form. The only place a route should be concatenated. */
export function formatModelRoute(provider: string, model: string): string {
  return `${provider}:${model}`;
}

/**
 * Whether `value` is a well-formed route rather than a bare model id.
 *
 * Deliberately a question with a `false` answer, never a throw: most callers
 * accept either form and only need to know which they were handed.
 * `agent-profile-registry` wants the strict version and can throw on `false`.
 */
export function isModelRoute(value: string): boolean {
  return parseModelRoute(value) !== null;
}

/**
 * Splits a route, or returns null when `value` is not one.
 *
 * Null — not an exception and not a guessed split — because "this is a bare
 * model id" is an ordinary, expected answer.
 */
export function parseModelRoute(value: string): ModelRouteParts | null {
  if (value.length === 0 || value.length > MAX_MODEL_ROUTE_LENGTH) return null;
  const separator = value.indexOf(":");
  // `separator < 1` rejects a leading colon (no provider); `separator ===
  // length - 1` rejects a trailing one (no model).
  if (separator < 1 || separator === value.length - 1) return null;
  const provider = value.slice(0, separator);
  if (!PROVIDER_PATTERN.test(provider)) return null;
  return { provider, model: value.slice(separator + 1) };
}

/** The provider part, or undefined when `value` is a bare model id. */
export function providerOf(value: string): string | undefined {
  return parseModelRoute(value)?.provider;
}

/**
 * The model name to send upstream.
 *
 * For a route that is the part after the provider; for a bare id it is the id
 * itself, unchanged. This is what provider adapters want: they must never cut a
 * model id in half just because it contains a colon.
 */
export function modelNameOf(value: string): string {
  const parsed = parseModelRoute(value);
  return parsed === null ? value : parsed.model;
}

/** The model name, or `fallback` when `value` carries none. */
export function modelNameOr(value: string | undefined, fallback: string): string {
  if (value === undefined || value.length === 0) return fallback;
  return modelNameOf(value);
}
