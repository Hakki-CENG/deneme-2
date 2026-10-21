/**
 * Capability Manifest — the contract an externally sourced capability must
 * satisfy before Aurora will run it.
 *
 * Why this is a separate type rather than twelve new fields on
 * `CapabilityDescriptor`: the repo already defines 427 capabilities, all
 * internal, all written here. Demanding a repository URL, a commit hash and a
 * license from those would be noise — they have no external provenance to
 * declare. But the whole point of attaching outside software is that Aurora
 * does not control it, does not audit it and cannot vouch for it. That is
 * exactly when provenance, permissions and a verifier stop being optional.
 *
 * So the split is by origin, not by convenience:
 *
 *   - internal capability  -> `CapabilityDescriptor` (types.ts)
 *   - adapted-in capability -> `CapabilityManifest` (here), all fields required
 *
 * The load-bearing rule in this file is `canClaimSuccess`. Gate C of the
 * integration standard says: "define a verifier; if there is none, return the
 * result as unverified." This module makes that mechanical rather than a
 * convention somebody has to remember. A manifest with no `verifierIds` cannot
 * produce `succeeded`, no matter what the underlying tool returned — because
 * "the subprocess exited 0" is not evidence that the task was accomplished.
 *
 * That reuses the existing execution vocabulary rather than inventing a second
 * one. `execution/execution-status.ts` already establishes that `succeeded` is
 * the only status counting as success and that `executed`, `unverified` and
 * `simulated` are not it. This file only decides which of those a run is
 * allowed to claim.
 */

import type { ExecutionStatus } from "../execution/execution-status.js";

/** Where the capability's code actually runs. */
export type CapabilityExecutionMode =
  /** Inside Aurora's own process. Only for small, pure, well-licensed code. */
  | "in-process"
  /** A child process Aurora spawns and supervises. */
  | "subprocess"
  /** A long-running local service Aurora talks to. */
  | "service"
  /** Somebody else's hosted API. */
  | "remote-api";

/** What the capability is allowed to reach on the network. */
export type CapabilityNetworkPolicy =
  | "none"
  | "allowlist"
  | "unrestricted-by-policy";

/** What the capability is allowed to touch on disk. */
export type CapabilityFilesystemPolicy =
  | "none"
  | "workspace-only"
  | "read-allowlist";

export interface CapabilityResourceLimits {
  readonly timeoutMs: number;
  readonly memoryMb?: number | undefined;
  readonly cpu?: number | undefined;
}

/**
 * Where an adapted capability came from.
 *
 * Required, and pinned to a commit rather than a branch: "we integrated
 * Playwright" is not a reproducible statement, and an unpinned `latest` means
 * the thing that was audited is not the thing that is running. `modelLicense`
 * is separate from `license` because an open-weight model and the code that
 * calls it are licensed differently, and treating them as one is how a
 * redistribution problem arrives unnoticed.
 */
export interface CapabilityProvenance {
  readonly repository: string;
  readonly commit: string;
  readonly license: string;
  readonly modelLicense?: string | undefined;
}

export interface CapabilityManifest {
  readonly id: string;
  readonly version: string;
  /** Which problem domains this serves, e.g. ["document-processing"]. */
  readonly domain: readonly string[];
  readonly description: string;
  readonly executionMode: CapabilityExecutionMode;
  readonly requiredPermissions: readonly string[];
  readonly networkPolicy: CapabilityNetworkPolicy;
  readonly filesystemPolicy: CapabilityFilesystemPolicy;
  readonly resourceLimits: CapabilityResourceLimits;
  /** How Aurora checks the backend is alive before trusting it. */
  readonly healthCheck: string;
  /**
   * Verifiers that can establish whether a run actually worked.
   *
   * May be empty — but then `canClaimSuccess` is false and every run is
   * reported `unverified`. An empty list is an honest declaration that nobody
   * can check this, which is more useful than a verifier that always passes.
   */
  readonly verifierIds: readonly string[];
  /** Benchmark suites this capability was measured against. */
  readonly benchmarks: readonly string[];
  readonly provenance: CapabilityProvenance;
  /** Known things this capability cannot do. Stated, not discovered at runtime. */
  readonly limitations: readonly string[];
  /** What to fall back to. Same quality class and permissions, or nothing. */
  readonly fallbackCapabilityIds: readonly string[];
}

/**
 * Every manifest field Aurora requires, by name.
 *
 * Listed rather than derived from the type, so that a field added to the
 * interface without being added here is caught by `assessManifest` returning
 * `complete: true` for a manifest that is missing it — the test asserts the
 * two lists agree.
 */
export const REQUIRED_MANIFEST_FIELDS = [
  "id",
  "version",
  "domain",
  "description",
  "executionMode",
  "requiredPermissions",
  "networkPolicy",
  "filesystemPolicy",
  "resourceLimits",
  "healthCheck",
  "verifierIds",
  "benchmarks",
  "provenance",
  "limitations",
  "fallbackCapabilityIds",
] as const;

export interface ManifestAssessment {
  readonly complete: boolean;
  /** Field names that are absent or empty where a value is required. */
  readonly missing: readonly string[];
}

/**
 * Whether a manifest declares everything Aurora needs to run and govern the
 * capability.
 *
 * An empty array is treated as missing for the fields where emptiness would be
 * a lie: `domain` (a capability that serves no domain cannot be routed to) and
 * `healthCheck` (a backend that cannot be checked cannot be reported healthy).
 * `verifierIds` and `benchmarks` are allowed to be empty — that is a real and
 * common state, and it has consequences rather than being rejected.
 */
export function assessManifest(manifest: CapabilityManifest): ManifestAssessment {
  const missing: string[] = [];
  const record = manifest as unknown as Record<string, unknown>;

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (record[field] === undefined || record[field] === null) missing.push(field);
  }

  if (manifest.domain.length === 0) missing.push("domain");
  if (manifest.healthCheck.trim() === "") missing.push("healthCheck");
  if (manifest.provenance.repository.trim() === "") missing.push("provenance.repository");
  if (manifest.provenance.commit.trim() === "") missing.push("provenance.commit");
  if (manifest.provenance.license.trim() === "") missing.push("provenance.license");
  if (!Number.isFinite(manifest.resourceLimits.timeoutMs) || manifest.resourceLimits.timeoutMs <= 0) {
    missing.push("resourceLimits.timeoutMs");
  }

  return { complete: missing.length === 0, missing: [...new Set(missing)] };
}

/**
 * Whether this capability is allowed to report `succeeded`.
 *
 * False when no verifier is declared. This is the rule the whole integration
 * standard rests on: without something that can establish the work was done,
 * the best honest report is that it ran and nobody checked.
 */
export function canClaimSuccess(manifest: CapabilityManifest): boolean {
  return manifest.verifierIds.length > 0;
}

/**
 * The status a run may actually report, given what the manifest declares.
 *
 * Only `succeeded` is ever downgraded, and only to `unverified`. Everything
 * else passes through untouched — a failure is still a failure, and a
 * capability with no verifier does not get to turn `blocked` into something
 * softer. Downgrading only the win is deliberate: the failure modes are
 * already honest, and it is the claim of success that needs evidence.
 */
export function statusForRun(
  manifest: CapabilityManifest,
  reported: ExecutionStatus,
): { status: ExecutionStatus; downgraded: boolean; reason?: string } {
  if (reported !== "succeeded") return { status: reported, downgraded: false };
  if (canClaimSuccess(manifest)) return { status: reported, downgraded: false };

  return {
    status: "unverified",
    downgraded: true,
    reason:
      `capability '${manifest.id}' declares no verifierIds, so nothing could establish that ` +
      "the run achieved its goal. The backend's own exit status is not evidence about the task.",
  };
}
