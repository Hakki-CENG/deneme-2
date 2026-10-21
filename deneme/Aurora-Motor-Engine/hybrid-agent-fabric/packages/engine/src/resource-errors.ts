/**
 * Typed "this resource does not exist" failures.
 *
 * The engine throws a plain `Error` for a missing resource in ~212 places. An
 * HTTP layer cannot tell any of them from a genuine malfunction without matching
 * on the message text, so every one answered 500. Measured: six `GET /v1/…/:id`
 * routes returned 500 for an id that simply did not exist —
 * `automations`, `checkpoints`, `decisions`, `detached-workers`, `plans` and
 * `society/authority/templates`.
 *
 * `runtime/session-errors.ts` already solved this for sessions, and its reasoning
 * applies unchanged here: an HTTP layer must be able to answer a client without
 * matching on error prose, because rewording a message must never silently change
 * an API's status code. The resource kind and id ride on the object as fields.
 *
 * This is the start of an incremental migration, not a rewrite of all 212 sites:
 * converting them in one pass would touch every service at once with no way to
 * tell a behaviour change from a mistake. Each converted site gets a test.
 */

/** The kind of resource a caller asked for, for error details and logging. */
export type ResourceKind =
  | "automation"
  | "checkpoint"
  | "decision"
  | "plan"
  | "authority-template"
  | "detached-worker"
  | "backend"
  | "connector"
  | "capability"
  | "skill"
  | "memory"
  | "experiment"
  | "simulation"
  | "resource"
  | "goal"
  | "step"
  | "verification"
  | "voice-input"
  | "image-input"
  | "pdf-input"
  | "audio-input"
  | "video-input"
  | "extension"
  | "instance"
  | "signing-key"
  | "research-result"
  | "research-watcher"
  | "issue"
  | "pipeline-run"
  | "refinement-batch"
  | "test"
  | "sandbox"
  | "task"
  | "learning-candidate"
  | "learning-release"
  | "model-configuration"
  | "backup"
  | "trajectory"
  | "agent-profile"
  | "inbox-message"
  | "session-tree-entry"
  | "message"
  | "scheduled-job"
  | "secret"
  | "secret-source"
  | "proposal"
  | "open-problem"
  | "thought"
  | "world-reference"
  | "repository-command"
  | "subagent"
  | "loop"
  | "entity"
  | "harness-entry"
  | "harness-refinement"
  | "route"
  | "identity-core"
  | "constitutional-principle"
  | "verdict"
  | "decision-option"
  | "delegation"
  | "distillation-proposal"
  | "trace"
  | "outcome-assessment"
  | "plan-step"
  | "github-app-key"
  | "github-app"
  | "github-app-installation"
  | "hosted-repository-provider"
  | "analysis-conflict"
  | "analysis-scenario"
  | "multi-world-analysis"
  | "world-perspective"
  | "world-causal-link"
  | "world-prediction"
  | "world-entity"
  | "model-oauth-source"
  | "model-provider"
  | "user-goal"
  | "project-next-action"
  | "user-project"
  | "advice"
  | "user-claim"
  | "git-source"
  | "automation-responder"
  | "question"
  | "question-option"
  | "hypothesis"
  | "research-queue-item"
  | "self-dialogue"
  | "interactive-artifact"
  | "cognitive-goal"
  | "cognitive-object"
  | "digital-twin"
  | "environment-resource"
  | "environment-action"
  | "skill-candidate"
  | "evolution-gap"
  | "initiative"
  | "initiative-watcher"
  | "microagent"
  | "media-job"
  | "thought-anchor"
  | "auto-approval-rule"
  | "lifecycle-hook-rule"
  | "risk-rule"
  | "background-shell"
  | "routing-rule"
  | "skill-hub-entry"
  | "society-message"
  | "society-role"
  | "society-task"
  | "society-deliberation"
  | "diagnostics-run"
  | "artifact-interaction"
  | "trade"
  | "computer-use-task"
  | "swarm"
  | "lesson"
  | "approval"
  | "label";

/**
 * A resource the caller named does not exist.
 *
 * Answers 404, not 500: the server worked correctly, the id was wrong. The
 * tenant is carried when the lookup was tenant-scoped, because "not found in
 * your tenant" and "not found at all" are the same status code but not the same
 * diagnostic.
 */
export class ResourceNotFoundError extends Error {
  constructor(
    readonly resource: ResourceKind,
    readonly id: string,
    readonly tenantId?: string,
    /**
     * Optional "what to do instead" note. Some callers used to tell the client
     * `does not exist; use create.` — that guidance is worth keeping, but it must
     * not be the only way an HTTP layer can recognise the failure, so it rides
     * along as data instead of being baked into the prose.
     */
    readonly hint?: string,
  ) {
    super(
      (tenantId === undefined
        ? `${labelFor(resource)} ${id} not found.`
        : `${labelFor(resource)} ${id} not found in tenant ${tenantId}.`) +
        (hint === undefined ? "" : ` ${hint}`),
    );
    this.name = "ResourceNotFoundError";
  }
}

function labelFor(resource: ResourceKind): string {
  switch (resource) {
    case "automation":
      return "Automation";
    case "checkpoint":
      return "Workspace checkpoint";
    case "decision":
      return "Aurora decision";
    case "plan":
      return "Plan";
    case "authority-template":
      return "Authority template";
    case "detached-worker":
      return "Detached worker";
    case "backend":
      return "Backend";
    case "connector":
      return "Connector";
    case "capability":
      return "Capability";
    case "skill":
      return "Skill";
    case "memory":
      return "Memory";
    case "experiment":
      return "Experiment";
    case "simulation":
      return "Simulation";
    case "resource":
      return "Resource";
    case "goal":
      return "Goal";
    case "step":
      return "Step";
    case "verification":
      return "Verification";
    case "voice-input":
      return "Voice input";
    case "image-input":
      return "Image input";
    case "pdf-input":
      return "PDF input";
    case "audio-input":
      return "Audio input";
    case "video-input":
      return "Video input";
    case "extension":
      return "Extension";
    case "instance":
      return "Instance";
    case "signing-key":
      return "Signing key";
    case "research-result":
      return "Research result";
    case "research-watcher":
      return "Research watcher";
    case "issue":
      return "Issue";
    case "pipeline-run":
      return "Pipeline run";
    case "refinement-batch":
      return "Refinement batch";
    case "test":
      return "Test";
    case "sandbox":
      return "Sandbox";
    case "task":
      return "Task";
    case "learning-candidate":
      return "Learning candidate";
    case "learning-release":
      return "Learning release";
    case "model-configuration":
      return "Model configuration";
    case "backup":
      return "Backup";
    case "trajectory":
      return "Trajectory";
    case "agent-profile":
      return "Agent profile";
    case "inbox-message":
      return "Agent inbox message";
    case "session-tree-entry":
      return "Session tree entry";
    case "message":
      return "Message";
    case "scheduled-job":
      return "Scheduled job";
    case "secret":
      return "Secret";
    case "secret-source":
      return "Secret source";
    case "proposal":
      return "Proposal";
    case "open-problem":
      return "Open problem";
    case "thought":
      return "Thought";
    case "world-reference":
      return "World reference";
    case "repository-command":
      return "Repository command";
    case "subagent":
      return "Subagent";
    case "loop":
      return "Detected loop";
    case "entity":
      return "Entity";
    case "harness-entry":
      return "Harness entry";
    case "harness-refinement":
      return "Harness refinement";
    case "route":
      return "Route";
    case "identity-core":
      return "Identity core";
    case "constitutional-principle":
      return "Constitutional principle";
    case "verdict":
      return "Verdict";
    case "decision-option":
      return "Decision option";
    case "delegation":
      return "Delegation";
    case "distillation-proposal":
      return "Distillation proposal";
    case "trace":
      return "Trace";
    case "outcome-assessment":
      return "Outcome assessment";
    case "plan-step":
      return "Plan step";
    case "github-app-key":
      return "GitHub App key";
    case "github-app":
      return "GitHub App";
    case "github-app-installation":
      return "GitHub App installation";
    case "hosted-repository-provider":
      return "Hosted repository provider";
    case "analysis-conflict":
      return "Analysis conflict";
    case "analysis-scenario":
      return "Analysis scenario";
    case "multi-world-analysis":
      return "Multi world analysis";
    case "world-perspective":
      return "World perspective";
    case "world-causal-link":
      return "World causal link";
    case "world-prediction":
      return "World prediction";
    case "world-entity":
      return "World entity";
    case "model-oauth-source":
      return "Model OAuth source";
    case "model-provider":
      return "Model provider";
    case "user-goal":
      return "User goal";
    case "project-next-action":
      return "Project next action";
    case "user-project":
      return "User project";
    case "advice":
      return "Advice";
    case "user-claim":
      return "User claim";
    case "git-source":
      return "Git source";
    case "automation-responder":
      return "Automation responder";
    case "question":
      return "Question";
    case "question-option":
      return "Question option";
    case "hypothesis":
      return "Hypothesis";
    case "research-queue-item":
      return "Research queue item";
    case "self-dialogue":
      return "Self dialogue";
    case "interactive-artifact":
      return "Interactive artifact";
    case "cognitive-goal":
      return "Cognitive goal";
    case "cognitive-object":
      return "Cognitive object";
    case "digital-twin":
      return "Digital twin";
    case "environment-resource":
      return "Environment resource";
    case "environment-action":
      return "Environment action";
    case "skill-candidate":
      return "Skill candidate";
    case "evolution-gap":
      return "Evolution gap";
    case "initiative":
      return "Initiative";
    case "initiative-watcher":
      return "Initiative watcher";
    case "microagent":
      return "Microagent";
    case "media-job":
      return "Media job";
    case "thought-anchor":
      return "Thought anchor";
    case "auto-approval-rule":
      return "Auto approval rule";
    case "lifecycle-hook-rule":
      return "Lifecycle hook rule";
    case "risk-rule":
      return "Risk rule";
    case "background-shell":
      return "Background shell";
    case "routing-rule":
      return "Routing rule";
    case "skill-hub-entry":
      return "Skill hub entry";
    case "society-message":
      return "Society message";
    case "society-role":
      return "Society role";
    case "society-task":
      return "Society task";
    case "society-deliberation":
      return "Society deliberation";
    case "diagnostics-run":
      return "Diagnostics run";
    case "artifact-interaction":
      return "Interactive artifact interaction";
    case "trade":
      return "Agent trade";
    case "computer-use-task":
      return "Computer-use task";
    case "swarm":
      return "Swarm";
    case "lesson":
      return "Lesson";
    case "approval":
      return "Pending approval";
    case "label":
      return "Goal reference";
  }
}
