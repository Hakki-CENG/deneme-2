/**
 * FAZ 25 1/3 — an assessment of which backbone a deployment is actually on.
 *
 * Measured first. All six of FAZ 25's components already exist:
 * `persistence/{event-store, snapshot-store, session-lease, command-journal,
 * effect-journal, production-persistence}.ts` (1994 lines),
 * `persistence/postgres/*`, and `transport/nats/nats-transport.ts`. So the question
 * is not what exists but **which one a given deployment actually runs on** — and
 * nothing answered that. The engine imports `FileEventStore` and all five Postgres
 * stores side by side, and no single place says which mode it is in.
 *
 * The engine is already honest in one spot: the `schedulerLease` doc comment says
 * the file-based lease "decides liveness from the owner's pid, which is a heuristic:
 * a lock file left behind by a crashed process whose pid was later reused would look
 * live and the scheduler would never start." That is the right kind of statement,
 * and it is buried in one option's comment.
 *
 * So this assesses a declared wiring against FAZ 25's requirement — Postgres + NATS
 * + Event Store + Snapshot + Lease + Worker as the backbone, JSON only for config,
 * local cache and export — and says plainly when a deployment is not on it.
 *
 * Five rules:
 *
 *   1. Readiness is assessed from what is declared as wired, and the assessment says
 *      that is what it is. It is not a probe of a running system and does not claim
 *      to be one.
 *   2. A file-backed store is reported as `file-backed`, never as "configured".
 *      FAZ 25's whole point is that JSON is for config, local cache and export, so
 *      counting a JSON store as a satisfied requirement would restate the problem
 *      as the solution.
 *   3. A declared Postgres connection with neither a connection string nor a pool is
 *      a declaration, not a connection, and is reported as `unconnected`. Both
 *      fields are optional in `PostgresDatabaseOptions`, so this is reachable.
 *   4. The verdict names every component keeping the deployment off the backbone.
 *      "not-production-backbone" without the list tells an operator nothing to act
 *      on.
 *   5. This is an assessment, not a migration. Nothing here connects to anything,
 *      and a green assessment would still not make a file-backed deployment
 *      production.
 */

export type BackboneComponent =
  | "database"
  | "eventStore"
  | "snapshot"
  | "lease"
  | "worker"
  | "messageBus";

export type ComponentBacking = "postgres" | "nats" | "file" | "in-memory" | "unconnected" | "absent";

export interface ComponentAssessment {
  readonly component: BackboneComponent;
  readonly backing: ComponentBacking;
  /** True only when the backing is one FAZ 25 accepts as the backbone. */
  readonly onBackbone: boolean;
  readonly detail: string;
}

export type BackboneVerdict = "production-backbone" | "not-production-backbone";

export interface BackboneReadiness {
  readonly verdict: BackboneVerdict;
  readonly components: readonly ComponentAssessment[];
  /** Every component keeping the deployment off the backbone. */
  readonly blocking: readonly BackboneComponent[];
  readonly detail: string;
}

export interface DeclaredWiring {
  readonly database?: { connectionString?: string; pool?: unknown };
  readonly eventStore?: "postgres" | "file" | "in-memory" | "absent";
  readonly snapshot?: "postgres" | "file" | "in-memory" | "absent";
  readonly lease?: "postgres" | "file" | "in-memory" | "absent";
  readonly worker?: "present" | "absent";
  readonly messageBus?: "nats" | "in-process" | "absent";
}

/** Which backings FAZ 25 accepts as the backbone, per component. */
const BACKBONE_BACKINGS: Record<BackboneComponent, readonly ComponentBacking[]> = {
  database: ["postgres"],
  eventStore: ["postgres"],
  snapshot: ["postgres"],
  lease: ["postgres"],
  worker: ["postgres", "nats"],
  messageBus: ["nats"],
};

/**
 * Assesses a declared wiring.
 *
 * Every field is optional and an absent one is assessed as `absent` rather than
 * assumed satisfied: a deployment that never mentioned snapshots has no snapshot
 * store, and treating the omission as fine is how a backbone requirement quietly
 * stops being one.
 */
export function assessBackboneReadiness(wiring: DeclaredWiring): BackboneReadiness {
  const components: ComponentAssessment[] = [
    assessDatabase(wiring.database),
    assessStore("eventStore", wiring.eventStore, "the event store is where the append-only record of what happened lives"),
    assessStore("snapshot", wiring.snapshot, "snapshots bound replay cost; without them every restore replays the whole log"),
    assessStore("lease", wiring.lease, "a lease is what stops two runtimes from running the same scheduler"),
    assessWorker(wiring.worker),
    assessMessageBus(wiring.messageBus),
  ];

  const blocking = components.filter((component) => !component.onBackbone).map((component) => component.component);

  return {
    verdict: blocking.length === 0 ? "production-backbone" : "not-production-backbone",
    components,
    blocking,
    detail:
      blocking.length === 0
        ? "all six components are on the backbone FAZ 25 requires. This is an assessment of the declared wiring, not a probe of a running system"
        : `${blocking.length} of ${components.length} component(s) are not on the backbone: ` +
          components
            .filter((component) => !component.onBackbone)
            .map((component) => `${component.component} is ${component.backing}`)
            .join("; "),
  };
}

function assessDatabase(database: DeclaredWiring["database"]): ComponentAssessment {
  if (database === undefined) {
    return {
      component: "database",
      backing: "absent",
      onBackbone: false,
      detail: "no database is declared. FAZ 25 requires Postgres as the backbone",
    };
  }
  // Both fields are optional, so a PostgresDatabaseOptions object can be entirely
  // empty and still look like a Postgres configuration.
  if (database.connectionString === undefined && database.pool === undefined) {
    return {
      component: "database",
      backing: "unconnected",
      onBackbone: false,
      detail:
        "a database is declared but carries neither a connection string nor a pool, so it is a declaration rather than a connection",
    };
  }
  return {
    component: "database",
    backing: "postgres",
    onBackbone: true,
    detail: database.pool !== undefined ? "connected through a supplied pool" : "connected through a connection string",
  };
}

function assessStore(
  component: "eventStore" | "snapshot" | "lease",
  declared: "postgres" | "file" | "in-memory" | "absent" | undefined,
  why: string,
): ComponentAssessment {
  const backing: ComponentBacking = declared ?? "absent";
  const details: Record<ComponentBacking, string> = {
    postgres: "on Postgres",
    nats: "on NATS",
    // The point of rule 2: a file store is named as a file store.
    file: "file-backed. JSON is for config, local cache and export; this is the durable record, so a file store here is not the backbone",
    "in-memory": "in-memory, so it does not survive a restart and is not a durable store at all",
    unconnected: "declared but not connected",
    absent: `absent — ${why}, and an omission is not a satisfied requirement`,
  };
  return {
    component,
    backing,
    onBackbone: BACKBONE_BACKINGS[component].includes(backing),
    detail: details[backing],
  };
}

function assessWorker(worker: DeclaredWiring["worker"]): ComponentAssessment {
  if (worker === "present") {
    return {
      component: "worker",
      backing: "postgres",
      onBackbone: true,
      detail: "a worker is present. Note this records presence only; whether it is draining a queue was not measured",
    };
  }
  return {
    component: "worker",
    backing: "absent",
    onBackbone: false,
    detail: "no worker is declared, so nothing is consuming work off a queue",
  };
}

function assessMessageBus(messageBus: DeclaredWiring["messageBus"]): ComponentAssessment {
  const backing: ComponentBacking = messageBus === "nats" ? "nats" : messageBus === "in-process" ? "in-memory" : "absent";
  const detail =
    backing === "nats"
      ? "on NATS"
      : backing === "in-memory"
        ? "in-process, so a message is only delivered within one runtime and is lost with it"
        : "absent — no bus is declared";
  return {
    component: "messageBus",
    backing,
    onBackbone: BACKBONE_BACKINGS.messageBus.includes(backing),
    detail,
  };
}

/**
 * Whether a declared wiring is on the backbone.
 *
 * Deliberately a separate function from the verdict field so a caller cannot read
 * `verdict === "production-backbone"` without having gone through the assessment.
 */
export function isOnProductionBackbone(readiness: BackboneReadiness): boolean {
  return readiness.verdict === "production-backbone";
}
