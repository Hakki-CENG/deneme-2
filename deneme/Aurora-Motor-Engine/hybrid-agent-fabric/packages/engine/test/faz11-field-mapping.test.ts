/**
 * FAZ 11 1/3 — a mapping reports what it could not do.
 *
 * The load-bearing rule is that an unmapped field is *absent* from the result
 * rather than present-but-empty, because an empty string in a synced record is
 * indistinguishable from a field the source genuinely left blank.
 */

import { describe, expect, it } from "vitest";

import { applyFieldMapping, discoverSchemaFromPayload, unmetTargets } from "../src/connectors/field-mapping.js";
import type { FieldMapping } from "../src/connectors/field-mapping.js";

const payload = { fullName: "Ada Lovelace", emailAddress: "ada@example.com", title: "Mathematician" };
const targets = ["name", "email", "role"];

const fullMapping: readonly FieldMapping[] = [
  { from: "fullName", to: "name" },
  { from: "emailAddress", to: "email" },
  { from: "title", to: "role" },
];

describe("a complete mapping is clean", () => {
  it("maps every target and says so", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), targets, fullMapping);
    expect(result.verdict).toBe("clean");
    expect(result.mapped).toBe(3);
    expect(result.values).toEqual({ name: "Ada Lovelace", email: "ada@example.com", role: "Mathematician" });
  });

  it("records a transform rather than hiding it", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), ["name", "email", "role"], [
      ...fullMapping.slice(0, 2),
      { from: "title", to: "role", transform: (value) => String(value).toUpperCase() },
    ]);
    expect(result.values["role"]).toBe("MATHEMATICIAN");
    expect(result.fields.find((f) => f.field === "role")?.outcome).toBe("transformed");
  });
});

describe("rule 1 — an unmapped field is absent, not empty", () => {
  it("leaves the field out of the values entirely", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), targets, fullMapping.slice(0, 2));

    expect(result.verdict).toBe("incomplete");
    expect(result.unmapped).toBe(1);
    // The point: no key at all, so a consumer cannot mistake it for a blank the
    // source supplied.
    expect(Object.keys(result.values)).not.toContain("role");
    expect(result.values["role"]).toBeUndefined();
    expect(result.summary).toContain("left out rather than filled in");
  });

  it("does not treat a genuinely empty source value as unmapped", () => {
    // The source really did send an empty title. That is data, and it is kept.
    const withBlank = { ...payload, title: "" };
    const result = applyFieldMapping(withBlank, discoverSchemaFromPayload("crm", withBlank), targets, fullMapping);
    expect(result.verdict).toBe("clean");
    expect(result.values["role"]).toBe("");
  });
});

describe("rule 2 — a mapping aimed at a field the source lacks is stale", () => {
  it("reports missing-source instead of producing half a record", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), targets, [
      ...fullMapping.slice(0, 2),
      { from: "jobTitle", to: "role" }, // renamed upstream, mapping not updated
    ]);
    expect(result.verdict).toBe("incomplete");
    expect(result.missingSource).toBe(1);
    expect(result.fields.find((f) => f.field === "role")?.detail).toContain("jobTitle");
  });
});

describe("rule 3 — nothing is invented", () => {
  it("produces only values the source actually had", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), [...targets, "phone"], [
      ...fullMapping,
      { from: "phoneNumber", to: "phone" },
    ]);
    for (const key of Object.keys(result.values)) {
      expect(Object.values(payload)).toContain(result.values[key]);
    }
  });
});

describe("rule 4 — one payload is a sample, not a schema", () => {
  it("marks a discovered schema as a sample and says so in the summary", () => {
    const schema = discoverSchemaFromPayload("crm", payload);
    expect(schema.provenance).toBe("sample");

    const result = applyFieldMapping(payload, schema, ["name"], [{ from: "fullName", to: "name" }]);
    expect(result.summary).toContain("single sample");
  });

  it("reads types off the values, enough to catch a wrong-kind mapping", () => {
    const schema = discoverSchemaFromPayload("crm", { count: 3, tags: ["a"], note: null });
    expect(schema.fields).toEqual([
      { name: "count", type: "number" },
      { name: "tags", type: "array" },
      { name: "note", type: "null" },
    ]);
  });

  it("does not add the caveat for a declared schema", () => {
    const schema = { source: "crm", provenance: "declared" as const, fields: [{ name: "fullName", type: "string" }] };
    const result = applyFieldMapping(payload, schema, ["name"], [{ from: "fullName", to: "name" }]);
    expect(result.verdict).toBe("clean");
    expect(result.summary).not.toContain("single sample");
  });
});

describe("rule 5 — nothing requested is not a clean sync", () => {
  it("reports incomplete for an empty target list", () => {
    const result = applyFieldMapping(payload, discoverSchemaFromPayload("crm", payload), [], fullMapping);
    expect(result.verdict).toBe("incomplete");
    expect(result.summary).toContain("no target fields were requested");
  });
});

describe("refusing before data moves", () => {
  it("names the targets a source cannot satisfy", () => {
    const schema = discoverSchemaFromPayload("crm", payload);
    const unmet = unmetTargets(schema, [...targets, "phone"], [...fullMapping, { from: "phoneNumber", to: "phone" }]);
    expect(unmet).toEqual(["phone"]);
  });

  it("reports everything unmet when the shapes do not correspond at all", () => {
    const schema = discoverSchemaFromPayload("legacy", { f1: "x", f2: "y" });
    expect(unmetTargets(schema, targets, [])).toEqual(targets);
  });

  it("reports nothing unmet for a complete mapping", () => {
    expect(unmetTargets(discoverSchemaFromPayload("crm", payload), targets, fullMapping)).toEqual([]);
  });
});
