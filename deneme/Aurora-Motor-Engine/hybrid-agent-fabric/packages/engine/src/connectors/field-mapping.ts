/**
 * FAZ 11 1/3 — a connector that cannot say which fields it did not map has not
 * really connected to anything.
 *
 * Measured first. `connectors/connector-service.ts` (420 lines) models connector
 * types, statuses, credentials, actions, events, sync results and five domain
 * shapes (EmailMessage, CalendarEvent, CrmContact, ErpOrder, IotDevice). What it
 * does not have is a single concrete provider — `provider` is a free string whose
 * comment reads "e.g., gmail, outlook, salesforce, sap, shopify" — and the words
 * "field mapping" and "schema discovery" appear in **zero** files in the engine.
 *
 * So a connector can reach `connected` and `SyncResult` can report success while
 * nobody has established that the fields on one side correspond to the fields on
 * the other. That is the same defect FAZ 6 closed for code, FAZ 9 for numbers and
 * FAZ 10 for automation, in a fourth place: a status that means "we tried"
 * reading as "it worked".
 *
 * Five rules:
 *
 *   1. A target field with no mapping is `unmapped`, never silently filled. An
 *      empty string, a zero or a "N/A" placed there by default is data nobody
 *      supplied, wearing the costume of data that was.
 *   2. A mapping whose source field is absent from the discovered schema is
 *      `missing-source` — the mapping is stale, and stale mappings fail loudly
 *      rather than quietly producing half a record.
 *   3. Nothing is ever invented. If the source does not have it, the result does
 *      not have it.
 *   4. A schema discovered from one payload is marked `sample`, not `live-payload`.
 *      One observation is not a schema; it is one observation.
 *   5. A sync that dropped or invented anything is not a clean sync, and says so.
 *
 * This deliberately builds no connectors. A connector here would need a live
 * third-party account and network access, and could only be an unverifiable
 * stub — the opposite of what this phase is about. What a real connector needs
 * is this layer underneath it.
 */

export interface DiscoveredField {
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
}

/** Where a schema came from, because that determines how much it can be trusted. */
export type SchemaProvenance = "live-payload" | "declared" | "sample";

export interface DiscoveredSchema {
  readonly source: string;
  readonly provenance: SchemaProvenance;
  readonly fields: readonly DiscoveredField[];
}

export interface FieldMapping {
  readonly from: string;
  readonly to: string;
  /** An optional transform. Optional, because a mapping that cannot be expressed
   *  as a rename should be visible as a mapping that needs one. */
  readonly transform?: (value: unknown) => unknown;
}

export type FieldOutcome = "mapped" | "unmapped" | "missing-source" | "transformed";

export interface FieldResult {
  readonly field: string;
  readonly outcome: FieldOutcome;
  readonly detail?: string;
}

export interface MappingResult {
  readonly values: Record<string, unknown>;
  readonly fields: readonly FieldResult[];
  readonly mapped: number;
  readonly unmapped: number;
  readonly missingSource: number;
  /** `clean` only when every target field was mapped from a real source field. */
  readonly verdict: "clean" | "incomplete";
  readonly summary: string;
}

/**
 * Infers a schema from a payload.
 *
 * Marked `sample`, never `live-payload`: one payload shows what one record
 * happened to contain, not what the source is capable of sending. Types are read
 * off the values, which is enough to catch a mapping pointed at the wrong kind of
 * thing and not enough to be called a contract.
 */
export function discoverSchemaFromPayload(source: string, payload: Record<string, unknown>): DiscoveredSchema {
  const fields = Object.keys(payload).map<DiscoveredField>((name) => ({
    name,
    type: Array.isArray(payload[name]) ? "array" : payload[name] === null ? "null" : typeof payload[name],
  }));
  return { source, provenance: "sample", fields };
}

/**
 * Maps one source record onto a set of target fields.
 *
 * `targets` is the list of fields the consumer needs; it is not derived from the
 * source, because the consumer's requirements are not a fact about the payload.
 */
export function applyFieldMapping(
  source: Record<string, unknown>,
  schema: DiscoveredSchema,
  targets: readonly string[],
  mappings: readonly FieldMapping[],
): MappingResult {
  const byTarget = new Map<string, FieldMapping>();
  for (const mapping of mappings) byTarget.set(mapping.to, mapping);

  const known = new Set(schema.fields.map((field) => field.name));
  const values: Record<string, unknown> = {};
  const fields: FieldResult[] = [];

  for (const target of targets) {
    const mapping = byTarget.get(target);

    // Rule 1: unmapped stays unmapped. No placeholder is written into `values`.
    if (mapping === undefined) {
      fields.push({ field: target, outcome: "unmapped", detail: "no mapping was supplied for this target field" });
      continue;
    }

    // Rule 2: a mapping aimed at a field the source does not have is stale.
    if (!known.has(mapping.from)) {
      fields.push({
        field: target,
        outcome: "missing-source",
        detail: `mapped from "${mapping.from}", which the ${schema.provenance} schema from ${schema.source} does not contain`,
      });
      continue;
    }

    const raw = source[mapping.from];
    if (mapping.transform === undefined) {
      values[target] = raw;
      fields.push({ field: target, outcome: "mapped" });
      continue;
    }
    values[target] = mapping.transform(raw);
    fields.push({ field: target, outcome: "transformed", detail: `transformed from "${mapping.from}"` });
  }

  const mapped = fields.filter((f) => f.outcome === "mapped" || f.outcome === "transformed").length;
  const unmapped = fields.filter((f) => f.outcome === "unmapped").length;
  const missingSource = fields.filter((f) => f.outcome === "missing-source").length;

  // Rule 5: anything dropped or missing means this is not a clean sync.
  const verdict = unmapped === 0 && missingSource === 0 && targets.length > 0 ? "clean" : "incomplete";

  const parts = [`${mapped}/${targets.length} target fields mapped`];
  if (unmapped > 0) parts.push(`${unmapped} had no mapping and were left out rather than filled in`);
  if (missingSource > 0) parts.push(`${missingSource} point at source fields that do not exist`);
  if (targets.length === 0) parts.push("no target fields were requested, so nothing was mapped");
  if (schema.provenance === "sample") {
    parts.push(`the schema came from a single sample, so a field absent here may still exist at the source`);
  }

  return { values, fields, mapped, unmapped, missingSource, verdict, summary: parts.join("; ") };
}

/**
 * Which target fields cannot be satisfied by this source at all?
 *
 * Answers that before any data moves, so a connector integration can be refused
 * on the grounds that the shapes do not correspond — rather than after a sync has
 * quietly produced records with holes in them.
 */
export function unmetTargets(
  schema: DiscoveredSchema,
  targets: readonly string[],
  mappings: readonly FieldMapping[],
): readonly string[] {
  const known = new Set(schema.fields.map((field) => field.name));
  const byTarget = new Map<string, FieldMapping>();
  for (const mapping of mappings) byTarget.set(mapping.to, mapping);
  return targets.filter((target) => {
    const mapping = byTarget.get(target);
    return mapping === undefined || !known.has(mapping.from);
  });
}
