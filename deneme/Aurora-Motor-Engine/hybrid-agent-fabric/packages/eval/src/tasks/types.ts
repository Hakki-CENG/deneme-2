/**
 * Eval Task Types
 * Defines the structure of evaluation tasks for Aurora.
 */

/**
 * Task categories matching Aurora's cognitive layers.
 *
 * The runtime list is the source and the type is derived from it, so the two
 * cannot drift: adding a category means adding it here, and anything that
 * switches over `EvalCategory` is then forced to handle it. A hand-maintained
 * second list would be a second opinion about what the categories are.
 */
export const EVAL_CATEGORIES = [
  "coding",                   // Write, fix, refactor code
  "tool_use",                 // Use filesystem, git, browser, MCP
  "memory",                   // Recall, associate, consolidate
  "planning",                 // Plan, replan, handle dependencies
  "recovery",                 // Handle failures, find alternatives
  "security",                 // Refuse dangerous ops, detect injection
  "reasoning",                // Multi-step reasoning, hypothesis testing
  "multimodal",               // Image, audio, document understanding
  "research",                 // Search, verify, synthesize
  "long_horizon",             // Multi-session, persistent goals
  "capability_acquisition",   // Detect gap, synthesize capability
] as const;

/** Task categories matching Aurora's cognitive layers. Derived from `EVAL_CATEGORIES`. */
export type EvalCategory = (typeof EVAL_CATEGORIES)[number];

/** Grading method */
export type GradingMethod =
  | "command"    // Run a command and check exit code / output
  | "property"   // Check file exists, content matches, state changed
  | "judge"      // LLM judges the output
  | "human"      // Human reviews and grades
  | "trajectory" // Check that specific steps were taken
  | "composite"   // Multiple graders combined
  | "evidence"    // The run left behind the evidence the task demanded
  | "constraint"; // A hard limit the run was not allowed to cross

/** Acceptance criteria */
export interface AcceptanceCriteria {
  type: GradingMethod;
  /** For "command": shell command to run */
  command?: string;
  /** For "command": expected exit code */
  exitCode?: number;
  /** For "command": output must contain */
  outputContains?: string[];
  /** For "command": output must NOT contain */
  outputNotContains?: string[];
  /** For "property": file must exist */
  fileExists?: string;
  /** For "property": file content regex */
  fileContentMatch?: string;
  /** For "property": file content must contain */
  fileContentContains?: string[];
  /** For "trajectory": required event kinds in order */
  requiredEvents?: string[];
  /** For "trajectory": forbidden event kinds */
  forbiddenEvents?: string[];
  /** For "composite": sub-graders */
  graders?: AcceptanceCriteria[];
  /** For "judge": rubric */
  rubric?: string;
  /** For "judge": minimum score (0-1) */
  minScore?: number;
}

/** Budget constraints */
export interface EvalBudget {
  maxTokens: number;
  maxSteps: number;
  maxCostUsd: number;
  timeoutMs: number;
}

/** A single evaluation task */
export interface EvalTask {
  /** Unique task ID */
  id: string;
  /** Category */
  category: EvalCategory;
  /** Human-readable name */
  name: string;
  /** Task instruction given to Aurora */
  instruction: string;
  /** Optional workspace setup (files to create, commands to run) */
  workspace?: WorkspaceSetup;
  /** Capabilities allowed for this task */
  allowedCapabilities?: string[];
  /** Acceptance criteria */
  acceptance: AcceptanceCriteria[];
  /** Budget constraints */
  budget: EvalBudget;
  /** Difficulty: 1-5 */
  difficulty: number;
  /** Tags for filtering */
  tags?: string[];
  /** Whether this task requires a model (vs pure tool use) */
  requiresModel?: boolean;
  /** Expected approximate steps (for metric comparison) */
  expectedSteps?: number;
  /** Expected approximate cost */
  expectedCostUsd?: number;

  /**
   * Hard limits the run was not allowed to cross — distinct from `acceptance`,
   * which inspects the artefact afterwards. Crossing one is a failure even when
   * every acceptance check passes.
   *
   * Deliberately a structured union rather than free text: a constraint nobody
   * can evaluate mechanically is documentation, not a constraint, and it would
   * silently pass every run. Kinds this runner cannot check are reported as a
   * failed grade instead of being skipped.
   */
  constraints?: TaskConstraint[];

  /**
   * Evidence the run has to leave behind, not just an outcome. Without this a
   * task can be "passed" by an agent that guessed the answer and never looked
   * at the repository, which is exactly the failure mode `falseSuccesses`
   * below exists to catch.
   */
  expectedEvidence?: ExpectedEvidence[];

  /**
   * Every domain this task genuinely exercises. `category` stays as the single
   * owning family for backwards compatibility, but a real task such as "find
   * the performance regression, fix it and assess the deployment risk" is
   * software-engineering AND performance AND devops at once. Routing and
   * per-domain scoring both need the full set.
   */
  domains?: string[];
}

/** A mechanically checkable limit on how a task may be solved. */
export interface TaskConstraint {
  /**
   * Which limit this is. Only kinds the runner can actually evaluate from the
   * trajectory are listed; anything else fails the grade rather than passing.
   */
  kind: "max_tool_calls" | "max_replans" | "no_capability";
  /** Numeric bound, for the `max_*` kinds. */
  limit?: number;
  /** Capability ids, for `no_capability`. */
  value?: string[];
  /** Human-readable statement, carried into the report. */
  description: string;
}

/** A piece of evidence a run must produce to count as a real attempt. */
export interface ExpectedEvidence {
  /** Machine-readable kind, e.g. "file_read", "command_run", "search". */
  kind: string;
  /** Substring or pattern the evidence must contain. */
  contains?: string;
  /** Minimum number of times this kind of evidence must appear. */
  minOccurrences?: number;
}

/** Workspace setup instructions */
export interface WorkspaceSetup {
  /** Files to create before task starts */
  files?: { path: string; content: string }[];
  /** Commands to run before task starts */
  setupCommands?: string[];
  /** Git repo to clone */
  gitRepo?: string;
  /** Git branch */
  gitBranch?: string;
}

/** Result of running an eval task */
export interface EvalResult {
  taskId: string;
  status: "pass" | "fail" | "error" | "timeout" | "budget_exceeded";
  score: number; // 0-1
  grades: GradeResult[];
  trajectory?: TrajectoryEvent[];
  metrics: TaskMetrics;
  error?: string | undefined;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

/** Individual grade result */
export interface GradeResult {
  criteria: GradingMethod;
  passed: boolean;
  score: number;
  details: string;
  evidence?: unknown;
}

/** Metrics for a single task run */
export interface TaskMetrics {
  totalTokens: number;
  totalCostUsd: number;
  totalSteps: number;
  toolCalls: number;
  toolFailures: number;
  replans: number;
  memoryRecalls: number;
  verificationAttempts: number;
  ttfbMs?: number; // Time to first byte
  tokensPerSecond?: number;
  /** How many attempts this task took before it stopped being retried. */
  attempts?: number;
  /** Set when a failed attempt was followed by a successful one. */
  recovered?: boolean;
  /** Set when acceptance passed but no independent verifier confirmed it. */
  unverifiedPass?: boolean;
}

/**
 * The comparison-level numbers, computed across a batch of runs.
 *
 * `TaskMetrics` describes one run; this describes a version. It is what answers
 * "is this release better than the last one?" — a question raw pass/fail cannot
 * answer, because a release can raise its pass rate purely by passing tasks it
 * never actually verified.
 */
export interface OutcomeMetrics {
  runs: number;
  taskSuccess: number;
  /** Passed AND confirmed by a verifier independent of the agent's own claim. */
  verifiedSuccess: number;
  /** Passed on the first attempt, before any retry. */
  firstAttemptSuccess: number;
  /** Of the runs that failed at least once, how many recovered. */
  recoverySuccess: number;
  /** Claimed success with no verification — the number to drive down. */
  falseSuccess: number;
  /** Share of tool calls that did not fail. */
  toolEfficiency: number;
  meanSteps: number;
  meanCostUsd: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  /** Mean of contextTokens / contextBudget across runs that declare a budget. */
  meanContextUtilisation: number;
  /** Total safety events — reported as a count because one is already a finding. */
  safetyViolations: number;
  /**
   * Proxy, not a measurement of plan quality: 1 - replans / steps. A run that
   * never replans scores 1.0 whether its plan was good or merely lucky. Kept
   * because plan stability is observable and plan quality is not; treat a rise
   * in replans as a signal to investigate, never as proof of a worse plan.
   */
  planningQualityProxy: number;
  /** Mean recall@k over the runs that measured retrieval; null if none did. */
  memoryRetrievalQuality: number | null;
  /**
   * Completion rate among runs that spanned more than one session. Null when no
   * long-horizon run exists, so a single-session batch does not report a
   * meaningless 0 or 1.
   */
  longHorizonCompletion: number | null;
  /** The same figures per domain, so a regression in one area is visible. */
  byDomain: Record<string, { runs: number; taskSuccess: number; verifiedSuccess: number; falseSuccess: number }>;
}

/** One completed run, in the shape the outcome metrics are computed from. */
/** Result of comparing two outcome snapshots. */
export interface OutcomeComparison {
  readonly verdict: "improved" | "regressed" | "unchanged";
  /** Human-readable deltas, including anything that made the verdict regressed. */
  readonly reasons: string[];
}

export interface RunRecord {
  taskId: string;
  domain: string;
  succeeded: boolean;
  verified: boolean;
  attempts: number;
  recovered: boolean;
  toolCalls: number;
  toolFailures: number;
  steps: number;
  costUsd: number;
  /** Wall-clock duration, for the latency figures. */
  durationMs: number;
  /** Context window consumed, and the budget it is measured against. */
  contextTokens: number;
  contextBudget: number;
  /**
   * Count of safety events the run produced (`injection_detected`,
   * `guardrail.tool_loop_limit`). Any non-zero value is a finding, not a score
   * to be averaged away, so the aggregate reports the total as well as a rate.
   */
  safetyViolations: number;
  /**
   * Sessions the run spanned. More than one makes it a long-horizon run, which
   * is graded separately because a single-session pass says nothing about
   * whether the agent can carry a goal across a day.
   */
  sessions: number;
  /** Replans the run performed, used by the planning-quality proxy. */
  replans: number;
  /**
   * Retrieval quality for this run, when the task measured it. Left undefined
   * rather than 0 when unmeasured: 0 would read as "retrieved nothing relevant"
   * and drag the average down for tasks that never exercised retrieval.
   */
  recallAtK?: number;
}

/** Trajectory event (simplified from engine's EventEnvelope) */
export interface TrajectoryEvent {
  sequence: number;
  kind: string;
  timestamp: string;
  source?: string;
  payload?: unknown;
}

/** Eval suite — a collection of tasks */
export interface EvalSuite {
  id: string;
  name: string;
  description: string;
  tasks: EvalTask[];
  /** Default budget for tasks that don't specify one */
  defaultBudget?: EvalBudget;
}

/** Summary of running a full suite */
export interface EvalSuiteResult {
  suiteId: string;
  totalTasks: number;
  passed: number;
  failed: number;
  errors: number;
  timeouts: number;
  overallScore: number; // weighted average
  results: EvalResult[];
  aggregateMetrics: TaskMetrics;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
