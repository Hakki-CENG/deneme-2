/**
 * The Zod → JSON Schema derivation behind `x-schema-status: derived-from-zod`.
 *
 * Two things have to hold, and they pull in opposite directions:
 *
 *   1. What it emits must be right. A schema narrower or wider than what the
 *      handler validates is worse than no schema, because an integrator trusts it.
 *   2. What it cannot represent must be refused, not approximated. So
 *      `.extend()`, `.refine()`, `.transform()`, `.passthrough()` and any
 *      unresolvable identifier throw — the route stays `unspecified`.
 *
 * The mapping cases below are the contract for (1); the rejection cases are the
 * contract for (2). Both were written from the constructs the routes actually
 * use, measured across main.ts and routes/.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ZodUnsupported, extractValidator, zodToJsonSchema } from "../../scripts/zod-to-schema.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
const SPEC = resolve(ROOT, "docs", "openapi.yaml");

function derive(source: string) {
  return zodToJsonSchema(source).schema;
}

describe("Zod to JSON Schema mapping", () => {
  it("maps scalars and their bounds", () => {
    expect(derive("z.string().min(1).max(100)")).toEqual({ type: "string", minLength: 1, maxLength: 100 });
    expect(derive("z.number().int().positive()")).toEqual({ type: "integer", exclusiveMinimum: 0 });
    expect(derive("z.boolean()")).toEqual({ type: "boolean" });
  });

  it("marks only the fields without a default or .optional() as required", () => {
    // This is the rule that decides whether an integrator must send a field.
    expect(
      derive('z.object({ tenantId: z.string().default("local"), requestId: z.string(), note: z.string().optional() })'),
    ).toEqual({
      type: "object",
      properties: {
        tenantId: { type: "string", default: "local" },
        requestId: { type: "string" },
        note: { type: "string" },
      },
      required: ["requestId"],
    });
  });

  it("maps enums, literals, arrays, records and unions", () => {
    expect(derive('z.enum(["a", "b"])')).toEqual({ enum: ["a", "b"] });
    expect(derive('z.literal("fixed")')).toEqual({ const: "fixed" });
    expect(derive("z.array(z.string().min(1))")).toEqual({ type: "array", items: { type: "string", minLength: 1 } });
    expect(derive("z.record(z.string())")).toEqual({ type: "object", additionalProperties: { type: "string" } });
    expect(derive("z.union([z.string(), z.number()])")).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
  });

  it("maps formats and keeps regex patterns", () => {
    expect(derive("z.string().uuid()")).toEqual({ type: "string", format: "uuid" });
    expect(derive("z.string().datetime()")).toEqual({ type: "string", format: "date-time" });
    expect(derive("z.string().regex(/^[a-z]+$/)")).toEqual({ type: "string", pattern: "^[a-z]+$" });
  });

  it("represents nullable as a type union including null", () => {
    expect(derive("z.string().nullable()")).toEqual({ type: ["string", "null"] });
  });

  it("nests objects without losing the inner required list", () => {
    expect(
      derive("z.object({ items: z.array(z.object({ path: z.string(), cost: z.number() })) })"),
    ).toEqual({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { path: { type: "string" }, cost: { type: "number" } }, required: ["path", "cost"] },
        },
      },
      required: ["items"],
    });
  });
});

describe("Zod constructs that must not be approximated", () => {
  // Each of these appears in the route sources. Guessing at them would publish a
  // schema that does not match what the server validates.
  const unsupported: Array<[string, string]> = [
    [".extend()", "z.object({ a: z.string() }).extend({ b: z.number() })"],
    [".passthrough()", "z.object({ a: z.string() }).passthrough()"],
    [".strict()", "z.object({ a: z.string() }).strict()"],
    [".refine()", "z.object({ a: z.string().refine((v) => v.length > 1) })"],
    [".transform()", "z.object({ a: z.string().transform((v) => v.trim()) })"],
    [".pipe()", "z.string().pipe(z.number())"],
    ["z.tuple()", "z.tuple([z.string(), z.number()])"],
    ["z.discriminatedUnion()", 'z.discriminatedUnion("kind", [z.object({ kind: z.literal("a") })])'],
    ["an unresolvable identifier", "z.object({ a: SOME_SHARED_SCHEMA })"],
    ["a regex with flags", "z.string().regex(/a/i)"],
  ];
  for (const [label, source] of unsupported) {
    it(`refuses ${label}`, () => {
      expect(() => derive(source)).toThrow(ZodUnsupported);
    });
  }
});

describe("extractValidator", () => {
  it("returns the inline expression that validates the target", () => {
    const handler = 'const b = z.object({ token: z.string().min(1) }).parse(request.body); return b;';
    expect(extractValidator(handler, "body")).toBe("z.object({ token: z.string().min(1) })");
  });

  it("returns null for a named schema, so the route stays unspecified", () => {
    expect(extractValidator("const q = SHARED_SCHEMA.parse(request.query);", "query")).toBeNull();
  });

  it("returns null when the handler does not validate that target at all", () => {
    expect(extractValidator("const b = request.body as Record<string, unknown>;", "body")).toBeNull();
  });
});

describe("the generated spec", () => {
  const text = readFileSync(SPEC, "utf8");
  // The banner comment in the spec mentions the marker too, so count the field
  // lines only — a plain grep overcounts by one.
  const derived = (text.match(/^ {6}x-schema-status: derived-from-zod$/gm) ?? []).length;
  const unspecified = (text.match(/^ {6}x-schema-status: unspecified$/gm) ?? []).length;
  const bodies = (text.match(/^ {6}requestBody:$/gm) ?? []).length;
  // The curated paths sit above the generated sentinel and carry hand-written
  // schemas with no marker at all. Counting them here keeps the total honest
  // instead of pinning a magic number.
  const curatedRegion = text.slice(text.indexOf("\npaths:\n"), text.indexOf("AUTO-GENERATED"));
  const curated = (curatedRegion.match(/^ {4}(get|post|put|patch|delete):$/gm) ?? []).length;

  it("derives a schema for every handler it understands", () => {
    expect(derived).toBeGreaterThan(200);
    // Every derived operation carries a request body, and nothing else does.
    expect(bodies).toBeGreaterThanOrEqual(derived);
  });

  it("accounts for every operation: derived, unknown, or hand-written", () => {
    expect(unspecified).toBeGreaterThan(0);
    expect(derived + unspecified + curated).toBe(863);
  });

  it("never emits an empty object schema in place of a real one", () => {
    // `{}` is a legitimate schema for z.unknown(), but not for a handler this
    // generator could not read — those must stay `unspecified`.
    expect(text).not.toMatch(/^ {14}schema: \{\}$/m);
  });
});
