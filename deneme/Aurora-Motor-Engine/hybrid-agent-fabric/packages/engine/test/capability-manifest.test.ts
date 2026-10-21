/**
 * The manifest is the socket an adapted capability plugs into, and the rule
 * that matters is the one about success.
 *
 * The load-bearing cases: a manifest with no verifier cannot report
 * `succeeded`, and the downgrade touches only the win — a failure stays a
 * failure. A test that only checked "a complete manifest validates" would pass
 * against a manifest module that enforced nothing.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CapabilityBroker } from "../src/capabilities/capability-broker.js";
import { EffectJournal } from "../src/persistence/effect-journal.js";
import { DefaultPolicyEngine } from "../src/policy/policy-engine.js";
import { ApprovalService } from "../src/policy/approval-service.js";

import {
  REQUIRED_MANIFEST_FIELDS,
  assessManifest,
  canClaimSuccess,
  statusForRun,
  type CapabilityManifest,
} from "../src/capabilities/manifest.js";
import { isSuccess } from "../src/execution/execution-status.js";

/** A manifest for a capability that can be checked. */
const verified: CapabilityManifest = {
  id: "docs.pdf.extract",
  version: "1.0.0",
  domain: ["document-processing", "research"],
  description: "Extract text and tables from a workspace PDF.",
  executionMode: "service",
  requiredPermissions: ["fs.read.workspace"],
  networkPolicy: "none",
  filesystemPolicy: "workspace-only",
  resourceLimits: { timeoutMs: 60_000, memoryMb: 1024 },
  healthCheck: "GET /health",
  verifierIds: ["docs.pdf.extract.citation-check"],
  benchmarks: ["docling-tables-v1"],
  provenance: {
    repository: "https://github.com/docling-project/docling",
    commit: "0000000000000000000000000000000000000000",
    license: "MIT",
  },
  limitations: ["scanned PDFs need the OCR path", "no handwriting support"],
  fallbackCapabilityIds: ["docs.ocr.tesseract"],
};

/** The same capability, but nobody can check its output. */
const unverifiable: CapabilityManifest = {
  ...verified,
  id: "media.image.generate",
  verifierIds: [],
};

describe("a complete manifest is accepted, and the field list is the real one", () => {
  it("reports no missing fields", () => {
    const assessment = assessManifest(verified);
    expect(assessment.missing).toEqual([]);
    expect(assessment.complete).toBe(true);
  });

  it("requires every field the type declares", () => {
    // If a field is added to CapabilityManifest but not to
    // REQUIRED_MANIFEST_FIELDS, this fails — which is the point.
    const declared = Object.keys(verified);
    expect([...REQUIRED_MANIFEST_FIELDS].sort()).toEqual(declared.sort());
  });
});

describe("a manifest that lies about itself is caught", () => {
  it("rejects an empty domain, because such a capability cannot be routed to", () => {
    const assessment = assessManifest({ ...verified, domain: [] });
    expect(assessment.complete).toBe(false);
    expect(assessment.missing).toContain("domain");
  });

  it("rejects a blank health check, because an uncheckable backend cannot be reported healthy", () => {
    const assessment = assessManifest({ ...verified, healthCheck: "   " });
    expect(assessment.missing).toContain("healthCheck");
  });

  it("rejects unpinned provenance — no repository, no commit, no license", () => {
    const assessment = assessManifest({
      ...verified,
      provenance: { repository: "", commit: "", license: "" },
    });
    expect(assessment.missing).toEqual(
      expect.arrayContaining(["provenance.repository", "provenance.commit", "provenance.license"]),
    );
  });

  it("rejects a timeout that is not a positive number", () => {
    expect(assessManifest({ ...verified, resourceLimits: { timeoutMs: 0 } }).missing).toContain(
      "resourceLimits.timeoutMs",
    );
    expect(
      assessManifest({ ...verified, resourceLimits: { timeoutMs: Number.NaN } }).missing,
    ).toContain("resourceLimits.timeoutMs");
  });

  it("does not list a missing field twice", () => {
    const assessment = assessManifest({ ...verified, domain: [], healthCheck: "" });
    expect(new Set(assessment.missing).size).toBe(assessment.missing.length);
  });
});

describe("no verifier means no claim of success", () => {
  it("lets a capability with a verifier claim success", () => {
    expect(canClaimSuccess(verified)).toBe(true);
  });

  it("refuses a capability with none", () => {
    expect(canClaimSuccess(unverifiable)).toBe(false);
  });

  it("downgrades a reported success to unverified, with the reason", () => {
    const result = statusForRun(unverifiable, "succeeded");

    expect(result.status).toBe("unverified");
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain("declares no verifierIds");
    expect(result.reason).toContain("exit status is not evidence about the task");
    // And the downgraded status must not count as success in the engine's own
    // vocabulary — the rule is worthless if `unverified` were still a win.
    expect(isSuccess(result.status)).toBe(false);
  });

  it("leaves a verified capability's success alone", () => {
    const result = statusForRun(verified, "succeeded");
    expect(result.status).toBe("succeeded");
    expect(result.downgraded).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(isSuccess(result.status)).toBe(true);
  });
});

describe("the downgrade touches only the win", () => {
  it.each([
    "failed",
    "blocked",
    "unavailable",
    "not_implemented",
    "simulated",
    "timed_out",
    "cancelled",
    "skipped",
    "executed",
    "unverified",
  ] as const)("passes %s through unchanged for a capability with no verifier", (status) => {
    const result = statusForRun(unverifiable, status);

    expect(result.status).toBe(status);
    expect(result.downgraded).toBe(false);
    // A capability with no verifier must not be able to soften a bad outcome
    // either — the rule is about evidence for success, not about excuse.
    expect(isSuccess(result.status)).toBe(false);
  });
});

describe("through the real broker, not just the pure functions", () => {
  async function broker(): Promise<CapabilityBroker> {
    const root = await mkdtemp(join(tmpdir(), "haf-manifest-"));
    return new CapabilityBroker(new DefaultPolicyEngine(), new ApprovalService(), new EffectJournal(root));
  }

  it("refuses to register an incomplete manifest, at the door", async () => {
    const b = await broker();

    expect(() => b.registerManifest({ ...verified, provenance: { repository: "", commit: "", license: "" } }))
      .toThrow(/incomplete/);
    expect(b.manifestFor(verified.id)).toBeUndefined();
  });

  it("accepts a complete manifest and can list it for audit", async () => {
    const b = await broker();

    b.registerManifest(verified);

    expect(b.manifestFor(verified.id)?.provenance.license).toBe("MIT");
    expect(b.listManifests().map((m) => m.id)).toEqual([verified.id]);
  });

  it("will not let a capability with no verifier claim success", async () => {
    const b = await broker();
    b.registerManifest(unverifiable);

    const result = b.statusForRun(unverifiable.id, "succeeded");

    expect(result.status).toBe("unverified");
    expect(isSuccess(result.status)).toBe(false);
  });

  it("treats a capability with no manifest at all as unverifiable, not as trusted", async () => {
    const b = await broker();

    const result = b.statusForRun("never.declared", "succeeded");

    expect(result.status).toBe("unverified");
    expect(result.reason).toContain("no registered manifest");
    // And the safe default does not soften a loss either.
    expect(b.statusForRun("never.declared", "failed").status).toBe("failed");
  });

  it("forgets the manifest when the capability is unregistered", async () => {
    const b = await broker();
    b.registerManifest(verified);
    expect(b.manifestFor(verified.id)).toBeDefined();

    b.unregister(verified.id);

    expect(b.manifestFor(verified.id)).toBeUndefined();
  });
});
