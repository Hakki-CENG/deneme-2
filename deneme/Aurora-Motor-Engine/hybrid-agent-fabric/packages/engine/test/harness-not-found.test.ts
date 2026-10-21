/**
 * Missing-resource failures in the continual harness and the Aurora `why()`
 * explainability services answer 404, not 500.
 *
 * Both families are reachable straight from HTTP:
 *   DELETE /v1/harness/entries/:entryId
 *   POST   /v1/harness/refinements
 *   POST   /v1/harness/refinements/:refinementId/rollback
 *   POST   /v1/harness/refinements/:refinementId/outcome
 *   POST   /v1/decisions/why, /v1/routing/why, /v1/planning/why, …
 * and until now a caller that named an id which simply was not there got a
 * 500 HAF-8001, indistinguishable from a server malfunction. Thirty-five of
 * the `why()` services shared one copy-pasted helper that ended in
 * `throw new Error("Entity not found")` — no id, no tenant, nothing for an
 * HTTP layer to act on.
 *
 * These tests drive the real services against real state on disk, so they fail
 * if any of those sites is reverted to a plain `Error`.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentEconomyService } from "../src/aurora/agent-economy.js";
import { ContinualHarnessService } from "../src/harness/continual-harness-service.js";
import { ResourceNotFoundError } from "../src/resource-errors.js";

const TENANT = "tenant-a";

let root: string;
let harness: ContinualHarnessService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haf-harness-404-"));
  harness = new ContinualHarnessService(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function notFound(promise: Promise<unknown>): Promise<ResourceNotFoundError> {
  const error = await promise.then(
    () => { throw new Error("expected the call to reject"); },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ResourceNotFoundError);
  return error as ResourceNotFoundError;
}

describe("continual harness — a missing id is a 404, not a malfunction", () => {
  it("remove() on an unknown entry names the resource, the id and the tenant", async () => {
    const error = await notFound(harness.remove(TENANT, "entry-does-not-exist"));
    expect(error.resource).toBe("harness-entry");
    expect(error.id).toBe("entry-does-not-exist");
    expect(error.tenantId).toBe(TENANT);
  });

  it("a delete operation on a missing entry reports component:key, not a bare prose string", async () => {
    const error = await notFound(harness.refine({
      tenantId: TENANT,
      trigger: "test",
      rationale: "delete something that was never created",
      operations: [{ operation: "delete", component: "prompt-note", key: "ghost" }],
    }));
    expect(error.resource).toBe("harness-entry");
    expect(error.id).toBe("prompt-note:ghost");
    expect(error.tenantId).toBe(TENANT);
  });

  it("an update operation on a missing entry stays a 404 but keeps the 'use create' guidance", async () => {
    const error = await notFound(harness.refine({
      tenantId: TENANT,
      trigger: "test",
      rationale: "update something that was never created",
      operations: [{ operation: "update", component: "memory", key: "ghost", title: "t", body: "b" }],
    }));
    expect(error.resource).toBe("harness-entry");
    // The guidance used to live inside the prose; it now rides as data so the
    // status code never depends on the wording.
    expect(error.hint).toBe("Use create instead.");
    expect(error.message).toContain("Use create instead.");
  });

  it("rollback() on an unknown refinement is a 404", async () => {
    const error = await notFound(harness.rollback(TENANT, "ref-does-not-exist"));
    expect(error.resource).toBe("harness-refinement");
    expect(error.id).toBe("ref-does-not-exist");
  });

  it("recordRefinementOutcome() on an unknown refinement is a 404", async () => {
    const error = await notFound(harness.recordRefinementOutcome(TENANT, "ref-does-not-exist", true, "fine"));
    expect(error.resource).toBe("harness-refinement");
    expect(error.id).toBe("ref-does-not-exist");
  });
});

describe("Aurora why() explainability — the shared helper is typed too", () => {
  it("names the entity id and tenant instead of 'Entity not found'", async () => {
    const economy = new AgentEconomyService(root);
    await economy.init();
    const error = await notFound(economy.why(TENANT, "entity-does-not-exist"));
    expect(error.resource).toBe("entity");
    expect(error.id).toBe("entity-does-not-exist");
    expect(error.tenantId).toBe(TENANT);
    expect(error.message).toContain("entity-does-not-exist");
  });

  it("does not leak another tenant's entity into the error", async () => {
    const economy = new AgentEconomyService(root);
    await economy.init();
    await economy.getOrCreateWallet("tenant-b", "agent-1");
    const error = await notFound(economy.why(TENANT, "agent-1"));
    expect(error.resource).toBe("entity");
    expect(error.tenantId).toBe(TENANT);
  });
});
