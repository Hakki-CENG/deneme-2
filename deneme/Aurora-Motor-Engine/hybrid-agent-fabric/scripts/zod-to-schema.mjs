/**
 * Convert the subset of Zod used by the control API's route validators into
 * JSON Schema, so `docs/openapi.yaml` can carry real request-body shapes instead
 * of 856 `x-schema-status: unspecified` stubs.
 *
 * The governing rule is that **an unrecognised construct is an error, never a
 * guess**. A schema that is narrower or wider than what the server actually
 * validates is worse than no schema, because an integrator will trust it. So
 * `.extend()`, `.refine()`, `.transform()`, `.passthrough()`,
 * `.discriminatedUnion()` and anything else outside the supported set throw
 * `ZodUnsupported`, and the caller leaves that route marked `unspecified`.
 *
 * Supported, because these are what the routes actually use:
 *   bases   z.string z.number z.boolean z.enum z.literal z.array z.record
 *           z.union z.object z.unknown z.any z.null
 *   methods .optional .nullable .default .catch .min .max .length .int
 *           .positive .nonnegative .negative .nonpositive .gt .gte .lt .lte
 *           .uuid .url .email .datetime .regex .trim .toLowerCase .toUpperCase
 *           .describe .nonempty
 */

export class ZodUnsupported extends Error {
  constructor(what) {
    super(`unsupported Zod construct: ${what}`);
    this.name = "ZodUnsupported";
    this.what = what;
  }
}

class Parser {
  constructor(source) {
    this.s = source;
    this.i = 0;
  }

  ws() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") this.i++;
      else if (c === "/" && this.s[this.i + 1] === "/") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
      } else break;
    }
  }

  peek() {
    this.ws();
    return this.s[this.i];
  }

  eat(expected) {
    this.ws();
    if (this.s[this.i] !== expected) {
      throw new ZodUnsupported(`expected "${expected}" at offset ${this.i} in: ${this.nearby()}`);
    }
    this.i++;
  }

  nearby() {
    return JSON.stringify(this.s.slice(Math.max(0, this.i - 20), this.i + 40));
  }

  ident() {
    this.ws();
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9_$]/.test(this.s[this.i])) this.i++;
    if (start === this.i) throw new ZodUnsupported(`expected an identifier at offset ${this.i} in: ${this.nearby()}`);
    return this.s.slice(start, this.i);
  }

  /** Any JSON-ish literal: string, number, boolean, null, array of literals. */
  literalValue() {
    this.ws();
    const c = this.s[this.i];
    if (c === '"' || c === "'" || c === "`") return this.string();
    if (c === "[") {
      this.i++;
      const items = [];
      while (this.peek() !== "]") {
        items.push(this.literalValue());
        if (this.peek() === ",") this.i++;
      }
      this.eat("]");
      return items;
    }
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9_.+-]/.test(this.s[this.i])) this.i++;
    const word = this.s.slice(start, this.i);
    if (word === "true") return true;
    if (word === "false") return false;
    if (word === "null") return null;
    const n = Number(word);
    if (word !== "" && Number.isFinite(n)) return n;
    throw new ZodUnsupported(`cannot represent the literal ${JSON.stringify(word)}`);
  }

  string() {
    const quote = this.s[this.i++];
    let out = "";
    while (this.i < this.s.length && this.s[this.i] !== quote) {
      if (this.s[this.i] === "\\") {
        const next = this.s[this.i + 1];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
        this.i += 2;
      } else out += this.s[this.i++];
    }
    if (this.s[this.i] !== quote) throw new ZodUnsupported("unterminated string literal");
    this.i++;
    return out;
  }

  /** A regex literal `/pattern/flags` — accepted only without flags. */
  regexLiteral() {
    this.ws();
    if (this.s[this.i] !== "/") throw new ZodUnsupported(`.regex() expects a regex literal, got ${this.nearby()}`);
    this.i++;
    let pattern = "";
    while (this.i < this.s.length && this.s[this.i] !== "/") {
      if (this.s[this.i] === "\\") {
        pattern += this.s[this.i] + (this.s[this.i + 1] ?? "");
        this.i += 2;
      } else pattern += this.s[this.i++];
    }
    this.eat("/");
    const flagStart = this.i;
    while (this.i < this.s.length && /[a-z]/.test(this.s[this.i])) this.i++;
    const flags = this.s.slice(flagStart, this.i);
    if (flags) throw new ZodUnsupported(`regex flags "${flags}" have no JSON Schema equivalent`);
    return pattern;
  }

  /** Arguments of a method call, as raw parsed values (schemas stay lazy). */
  argList(parseSchema) {
    this.eat("(");
    const args = [];
    if (this.peek() === ")") {
      this.i++;
      return args;
    }
    for (;;) {
      this.ws();
      args.push(this.arg(parseSchema));
      if (this.peek() === ",") {
        this.i++;
        continue;
      }
      break;
    }
    this.eat(")");
    return args;
  }

  arg(parseSchema) {
    this.ws();
    const start = this.i;
    if (this.s.startsWith("z.", this.i)) return parseSchema();
    if (this.s.startsWith("...")) this.i += 3; // rest element — handled by callers
    if (this.s[this.i] === "[") {
      // Elements are parsed with arg() too, so an enum array yields literals
      // while a union array yields schemas. Treating every array as literals
      // made z.union([z.string(), z.number()]) unparseable.
      this.i++;
      const items = [];
      while (this.peek() !== "]") {
        items.push(this.arg(parseSchema));
        if (this.peek() === ",") this.i++;
      }
      this.eat("]");
      return items;
    }
    if (this.s[this.i] === "/" ) return { __regex: this.regexLiteral() };
    // An identifier that is not `z.…` is a variable reference we cannot resolve.
    if (/[A-Za-z_$]/.test(this.s[this.i] ?? "")) {
      const word = this.ident();
      if (["true", "false", "null"].includes(word)) return this.literalValue.call(Object.assign(this, { i: start }));
      throw new ZodUnsupported(`reference to "${word}" cannot be resolved statically`);
    }
    return this.literalValue();
  }

  /** Parse one Zod schema expression and return a JSON Schema fragment. */
  schema() {
    this.ws();
    if (!this.s.startsWith("z.", this.i)) throw new ZodUnsupported(`expected "z." at ${this.nearby()}`);
    this.i += 2;
    const kind = this.ident();
    let node;
    let optional = false;

    switch (kind) {
      case "string":
        node = { type: "string" };
        this.argList(() => this.schema());
        break;
      case "number":
        node = { type: "number" };
        this.argList(() => this.schema());
        break;
      case "boolean":
        node = { type: "boolean" };
        this.argList(() => this.schema());
        break;
      case "null":
        node = { type: "null" };
        this.argList(() => this.schema());
        break;
      case "unknown":
      case "any":
        node = {};
        this.argList(() => this.schema());
        break;
      case "enum": {
        const args = this.argList(() => this.schema());
        const values = args[0];
        if (!Array.isArray(values) || values.length === 0) throw new ZodUnsupported("z.enum() needs a non-empty array of literals");
        node = { enum: values };
        break;
      }
      case "literal": {
        const args = this.argList(() => this.schema());
        node = { const: args[0] };
        break;
      }
      case "array": {
        const args = this.argList(() => this.schema());
        const inner = unwrap(args[0]);
        if (!inner) throw new ZodUnsupported("z.array() needs an element schema");
        node = { type: "array", items: inner };
        break;
      }
      case "record": {
        const args = this.argList(() => this.schema());
        // z.record(value) or z.record(key, value)
        const value = unwrap(args.length > 1 ? args[1] : args[0]);
        if (!value) throw new ZodUnsupported("z.record() needs a value schema");
        node = { type: "object", additionalProperties: value };
        break;
      }
      case "union": {
        const args = this.argList(() => this.schema());
        const members = Array.isArray(args[0]) ? args[0].map(unwrap).filter(Boolean) : [];
        if (members.length < 2) throw new ZodUnsupported("z.union() needs at least two resolvable members");
        node = { anyOf: members };
        break;
      }
      case "object": {
        node = this.objectBody();
        break;
      }
      default:
        throw new ZodUnsupported(`z.${kind}()`);
    }

    // Method chain.
    for (;;) {
      this.ws();
      if (this.s[this.i] !== ".") break;
      this.i++;
      const method = this.ident();
      switch (method) {
        case "optional":
          this.argList(() => this.schema());
          optional = true;
          break;
        case "nullable":
          this.argList(() => this.schema());
          node = withNull(node);
          break;
        case "default":
        case "catch": {
          const args = this.argList(() => this.schema());
          if (args.length && !isSchemaLike(args[0])) node = { ...node, default: args[0] };
          optional = true;
          break;
        }
        case "min":
        case "gte": {
          const n = numeric(this.argList(() => this.schema()), method);
          node = bound(node, { minLength: n, minimum: n, minItems: n });
          break;
        }
        case "max":
        case "lte": {
          const n = numeric(this.argList(() => this.schema()), method);
          node = bound(node, { maxLength: n, maximum: n, maxItems: n });
          break;
        }
        case "gt": {
          const n = numeric(this.argList(() => this.schema()), method);
          node = bound(node, { exclusiveMinimum: n });
          break;
        }
        case "lt": {
          const n = numeric(this.argList(() => this.schema()), method);
          node = bound(node, { exclusiveMaximum: n });
          break;
        }
        case "length": {
          const n = numeric(this.argList(() => this.schema()), method);
          node = bound(node, { minLength: n, maxLength: n, minItems: n, maxItems: n });
          break;
        }
        case "nonempty":
          this.argList(() => this.schema());
          node = bound(node, { minItems: 1 });
          break;
        case "int":
          this.argList(() => this.schema());
          if (typeOf(node) !== "number") throw new ZodUnsupported(`.int() on a ${describe(node)}`);
          node = { ...node, type: "integer" };
          break;
        case "positive":
          this.argList(() => this.schema());
          node = bound(node, { exclusiveMinimum: 0 });
          break;
        case "nonnegative":
          this.argList(() => this.schema());
          node = bound(node, { minimum: 0 });
          break;
        case "negative":
          this.argList(() => this.schema());
          node = bound(node, { exclusiveMaximum: 0 });
          break;
        case "nonpositive":
          this.argList(() => this.schema());
          node = bound(node, { maximum: 0 });
          break;
        case "uuid":
          this.argList(() => this.schema());
          node = { ...node, format: "uuid" };
          break;
        case "url":
          this.argList(() => this.schema());
          node = { ...node, format: "uri" };
          break;
        case "email":
          this.argList(() => this.schema());
          node = { ...node, format: "email" };
          break;
        case "datetime":
          this.argList(() => this.schema());
          node = { ...node, format: "date-time" };
          break;
        case "regex": {
          // The "(" belongs to the call, not the literal: eat it first.
          this.eat("(");
          const pattern = this.regexLiteral();
          this.ws();
          if (this.s[this.i] === ",") {
            // A second argument is a message or params object we cannot express.
            this.i++;
            this.arg(() => this.schema());
          }
          this.eat(")");
          node = { ...node, pattern };
          break;
        }
        case "trim":
        case "toLowerCase":
        case "toUpperCase":
          // Value normalisation, not a shape constraint: the JSON type is unchanged.
          this.argList(() => this.schema());
          break;
        case "describe": {
          const args = this.argList(() => this.schema());
          if (typeof args[0] === "string") node = { ...node, description: args[0] };
          break;
        }
        case "parse":
        case "safeParse":
          // The end of the validator expression; the caller stops here.
          this.i = this.s.length;
          return { schema: node, optional };
        default:
          throw new ZodUnsupported(`.${method}()`);
      }
    }
    return { schema: node, optional };
  }

  objectBody() {
    this.eat("(");
    this.eat("{");
    const properties = {};
    const required = [];
    while (this.peek() !== "}") {
      this.ws();
      const key = this.objectKey();
      this.eat(":");
      const { schema, optional } = this.schema();
      properties[key] = schema;
      if (!optional) required.push(key);
      this.ws();
      if (this.s[this.i] === ",") this.i++;
    }
    this.eat("}");
    this.eat(")");
    const node = { type: "object", properties };
    if (required.length > 0) node.required = required;
    return node;
  }

  objectKey() {
    this.ws();
    const c = this.s[this.i];
    if (c === '"' || c === "'" || c === "`") return this.string();
    const start = this.i;
    while (this.i < this.s.length && /[A-Za-z0-9_$]/.test(this.s[this.i])) this.i++;
    if (start === this.i) throw new ZodUnsupported(`expected an object key at ${this.nearby()}`);
    return this.s.slice(start, this.i);
  }
}

/** z.array/z.record/z.union receive {schema, optional} wrappers; unwrap them. */
function unwrap(value) {
  if (value && typeof value === "object" && "schema" in value && "optional" in value) return value.schema;
  return value && typeof value === "object" ? value : null;
}

function isSchemaLike(value) {
  return value && typeof value === "object" && !Array.isArray(value) && !("__regex" in value);
}

function typeOf(node) {
  return Array.isArray(node.type) ? node.type[0] : node.type;
}

function describe(node) {
  return node.enum ? "enum" : node.anyOf ? "union" : (typeOf(node) ?? "schema");
}

function withNull(node) {
  const t = node.type;
  if (typeof t === "string") return { ...node, type: [t, "null"] };
  if (Array.isArray(t)) return t.includes("null") ? node : { ...node, type: [...t, "null"] };
  return { anyOf: [node, { type: "null" }] };
}

/** Apply a numeric constraint to whichever JSON type the node actually is. */
function bound(node, options) {
  const t = typeOf(node);
  if (t === "string" && options.minLength !== undefined) return { ...node, minLength: options.minLength };
  if (t === "string" && options.maxLength !== undefined) return { ...node, maxLength: options.maxLength };
  if ((t === "number" || t === "integer") && options.minimum !== undefined) return { ...node, minimum: options.minimum };
  if ((t === "number" || t === "integer") && options.maximum !== undefined) return { ...node, maximum: options.maximum };
  if ((t === "number" || t === "integer") && options.exclusiveMinimum !== undefined) return { ...node, exclusiveMinimum: options.exclusiveMinimum };
  if ((t === "number" || t === "integer") && options.exclusiveMaximum !== undefined) return { ...node, exclusiveMaximum: options.exclusiveMaximum };
  if (t === "array" && options.minItems !== undefined) return { ...node, minItems: options.minItems };
  if (t === "array" && options.maxItems !== undefined) return { ...node, maxItems: options.maxItems };
  if (t === "string" && options.minLength === undefined && options.maxLength === undefined) {
    // .length() on a string sets both; anything else is a type mismatch.
    throw new ZodUnsupported(`numeric constraint on a ${describe(node)}`);
  }
  if (t === undefined) return { ...node, ...options };
  throw new ZodUnsupported(`numeric constraint on a ${describe(node)}`);
}

function numeric(args, method) {
  const n = args[0];
  if (typeof n !== "number" || !Number.isFinite(n)) throw new ZodUnsupported(`.${method}() needs a numeric literal`);
  return n;
}

/**
 * Parse a Zod expression into JSON Schema.
 * @returns {{ schema: object, optional: boolean }}
 * @throws {ZodUnsupported} when any part of the expression cannot be represented.
 */
export function zodToJsonSchema(source) {
  const parser = new Parser(source);
  const result = parser.schema();
  parser.ws();
  if (parser.i < parser.s.length) {
    throw new ZodUnsupported(`trailing input ${parser.nearby()}`);
  }
  return result;
}

/**
 * Extract the balanced `z.…` expression that ends at `.parse(<target>)`.
 * Returns null when the handler does not validate `<target>` with an inline
 * Zod expression (a named schema or a bare cast both land here).
 */
export function extractValidator(handlerSource, target) {
  const marker = `.parse(request.${target})`;
  const at = handlerSource.indexOf(marker);
  if (at < 0) return null;
  // Walk backwards to the `z.` that opens this expression, tracking nesting so a
  // `z.` belonging to an inner schema is not mistaken for the outer one.
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = handlerSource[i];
    if (c === ")" || c === "]" || c === "}") depth++;
    else if (c === "(" || c === "[" || c === "{") {
      if (depth === 0) return null; // the expression is not self-contained on this line
      depth--;
    } else if (depth === 0 && c === "z" && handlerSource[i + 1] === ".") {
      return handlerSource.slice(i, at);
    }
  }
  return null;
}
