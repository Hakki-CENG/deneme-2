# Aurora Motor Engine — API Reference

## Overview
- **Total Endpoints:** 862 operations / 732 paths
- **Base URL:** `/v1`
- **Content-Type:** `application/json`

## Authentication
Tenant authorisation is enforced by `requireAuth` in `apps/control-api/src/auth/auth-guards.ts`,
which resolves the tenant from the record and rejects a mismatch with `HAF-1010`.
System-admin and public-webhook routes are exempt; see that file for the exact sets.

## Pagination
List endpoints support pagination with `page` and `pageSize` query parameters.
Response format: `{ data: [...], pagination: { page, pageSize, total, totalPages, hasNext, hasPrev } }`

---

## Adaptive Router

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/adaptive-router/stats` | Stats |
| `POST` | `/v1/adaptive-router/route` | Route |

## Attention V2

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/attention-v2/stats` | Stats |
| `GET` | `/v1/attention-v2/targets` | Targets |
| `POST` | `/v1/attention-v2/allocate` | Allocate |
| `POST` | `/v1/attention-v2/target` | Target |

## Benchmarks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/benchmarks/runs` | Runs |
| `GET` | `/v1/benchmarks/stats` | Stats |
| `POST` | `/v1/benchmarks/run` | Run |

## Budget

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/budget/status` | Status |

## Capabilities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/capabilities/assessment` | Assessment |

## Causal

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/causal/impact` | Impact |

## Causal Graph

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/causal-graph/stats` | Stats |
| `POST` | `/v1/causal-graph/edge` | Edge |
| `POST` | `/v1/causal-graph/node` | Node |
| `POST` | `/v1/causal-graph/paths` | Paths |

## Cognitive

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/cognitive/reflection` | Reflection |
| `POST` | `/v1/cognitive/cycle` | Cycle |

## Cognitive State

`/v1/cognitive-state` returns a single most-recent-wins view, which is
ambiguous whenever more than one task is in flight. The per-task endpoints
answer the same question per task.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/cognitive-state` | Flat snapshot (last writer wins) |
| `GET` | `/v1/cognitive-state/history` | Mode change history |
| `POST` | `/v1/cognitive-state/reset` | Clear state and all task slots |
| `GET` | `/v1/cognitive-state/tasks` | Tasks currently running, each with its own goal/plan |
| `GET` | `/v1/cognitive-state/tasks/:taskId` | One task's record; `404` if the id is unknown |

## Cognitive Telemetry

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/cognitive-telemetry/cost` | Cost |

## Composition

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/composition/stats` | Stats |
| `POST` | `/v1/composition/component` | Component |
| `POST` | `/v1/composition/compose` | Compose |

## Constitution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/constitution/why` | Why |

## Context

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/context/optimize` | Optimize |

## Critic

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/critic/reviews` | Reviews |
| `GET` | `/v1/critic/stats` | Stats |
| `POST` | `/v1/critic/resolve` | Resolve |
| `POST` | `/v1/critic/review` | Review |

## Dashboard

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/dashboard/metrics` | Metrics |

## Decisions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/decisions/lifecycle` | Lifecycle |
| `POST` | `/v1/decisions/why` | Why |

## Economy

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/economy/trades` | Trades |
| `GET` | `/v1/economy/wallets` | Wallets |
| `POST` | `/v1/economy/trade` | Trade |
| `POST` | `/v1/economy/trade/:id/accept` | Accept |

## Experiments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/experiments` | Experiments |
| `GET` | `/v1/experiments/stats` | Stats |
| `POST` | `/v1/experiments` | Experiments |
| `POST` | `/v1/experiments/:id/complete` | Complete |
| `POST` | `/v1/experiments/:id/result` | Result |
| `POST` | `/v1/experiments/:id/start` | Start |

## Explain

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/explain/full` | Full |

## Feedback

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/feedback/outcome` | Outcome |

## Goal Stack

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/goal-stack/active` | Active |
| `GET` | `/v1/goal-stack/metrics` | Metrics |
| `GET` | `/v1/goal-stack/tree` | Tree |
| `POST` | `/v1/goal-stack` | Goal Stack |
| `POST` | `/v1/goal-stack/:id/progress` | Progress |

## Goals

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/goals/why` | Why |

## Hypotheses

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/hypotheses/why` | Why |

## Learned World

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/learned-world/stats` | Stats |
| `POST` | `/v1/learned-world/entity` | Entity |
| `POST` | `/v1/learned-world/query` | Query |
| `POST` | `/v1/learned-world/relation` | Relation |
| `POST` | `/v1/learned-world/rule` | Rule |

## Learning

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/learning/effectiveness` | Effectiveness |
| `GET` | `/v1/learning/summary` | Summary |

## Long Horizon Memory

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/long-horizon-memory` | Long Horizon Memory |
| `GET` | `/v1/long-horizon-memory/stats` | Stats |
| `POST` | `/v1/long-horizon-memory` | Long Horizon Memory |
| `POST` | `/v1/long-horizon-memory/consolidate` | Consolidate |

## Marketplace

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/marketplace/search` | Search |
| `GET` | `/v1/marketplace/stats` | Stats |
| `POST` | `/v1/marketplace/list` | List |
| `POST` | `/v1/marketplace/request` | Request |

## Memory

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/memory/consolidate` | Consolidate |

## Meta Controller

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/meta-controller/why` | Why |

## Model Capabilities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/model-capabilities` | Model Capabilities |
| `GET` | `/v1/model-capabilities/:modelId` | :Modelid |
| `GET` | `/v1/model-capabilities/stats` | Stats |
| `POST` | `/v1/model-capabilities` | Model Capabilities |
| `POST` | `/v1/model-capabilities/:modelId/benchmark` | Benchmark |
| `POST` | `/v1/model-capabilities/:modelId/outcome` | Outcome |
| `POST` | `/v1/model-capabilities/select` | Select |

## Models

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/models/orchestrate` | Orchestrate |

## Multi Hypothesis

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/multi-hypothesis` | Multi Hypothesis |
| `GET` | `/v1/multi-hypothesis/chains` | Chains |
| `GET` | `/v1/multi-hypothesis/evidence-graph` | Evidence Graph |
| `GET` | `/v1/multi-hypothesis/stats` | Stats |
| `POST` | `/v1/multi-hypothesis` | Multi Hypothesis |
| `POST` | `/v1/multi-hypothesis/:id/calibrate` | Calibrate |
| `POST` | `/v1/multi-hypothesis/:id/evidence` | Evidence |
| `POST` | `/v1/multi-hypothesis/:id/start-testing` | Start Testing |
| `POST` | `/v1/multi-hypothesis/reason` | Reason |
| `POST` | `/v1/multi-hypothesis/supersede` | Supersede |

## Neural Core

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/neural-core/stats` | Stats |
| `POST` | `/v1/neural-core/activate` | Activate |
| `POST` | `/v1/neural-core/pattern` | Pattern |

## Planner V2

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/planner-v2` | Planner V2 |
| `GET` | `/v1/planner-v2/stats` | Stats |
| `POST` | `/v1/planner-v2` | Planner V2 |
| `POST` | `/v1/planner-v2/:id/activate` | Activate |
| `POST` | `/v1/planner-v2/:id/step` | Step |

## Planning

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/planning/goal-driven` | Goal Driven |
| `POST` | `/v1/planning/why` | Why |

## Proactive

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/proactive/anticipate` | Anticipate |

## Reputation

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/reputation` | Reputation |
| `GET` | `/v1/reputation/stats` | Stats |
| `POST` | `/v1/reputation/endorse` | Endorse |
| `POST` | `/v1/reputation/interaction` | Interaction |

## Resources

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/resources/stats` | Stats |
| `POST` | `/v1/resources/allocate` | Allocate |
| `POST` | `/v1/resources/analyze` | Analyze |

## Risk

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/risk/assessment` | Assessment |

## Routing

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/routing/learn` | Learn |
| `POST` | `/v1/routing/smart` | Smart |
| `POST` | `/v1/routing/why` | Why |

## Search

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/search/unified` | Unified |

## Self Debugging

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/self-debugging/bugs` | Bugs |
| `GET` | `/v1/self-debugging/stats` | Stats |
| `POST` | `/v1/self-debugging/bug` | Bug |
| `POST` | `/v1/self-debugging/fix` | Fix |
| `POST` | `/v1/self-debugging/heal` | Heal |

## Self Model

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/self-model/awareness` | Awareness |
| `GET` | `/v1/self-model/gaps` | Gaps |

## Shared Learning

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/shared-learning` | Shared Learning |
| `GET` | `/v1/shared-learning/stats` | Stats |
| `POST` | `/v1/shared-learning` | Shared Learning |
| `POST` | `/v1/shared-learning/:id/adopt` | Adopt |

## Skills

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/skills/similar` | Similar |
| `POST` | `/v1/skills/transfer` | Transfer |

## Society

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/society/overview` | Overview |

## Strategy

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/strategy/recommendations` | Recommendations |

## Swarm

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/swarm` | Swarm |
| `GET` | `/v1/swarm/stats` | Stats |
| `POST` | `/v1/swarm` | Swarm |
| `POST` | `/v1/swarm/:id/member` | Member |
| `POST` | `/v1/swarm/:id/task` | Task |

## System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/system/diagnosis` | Diagnosis |
| `GET` | `/v1/system/health` | Health |

<!-- BEGIN GENERATED ENDPOINT_INDEX -->
<!--
  GENERATED by scripts/generate-api-reference.mjs from docs/openapi.yaml.
  Do not edit below this banner — run `npm run docs:api-reference` instead.
  `npm run docs:openapi:check` fails if this section is stale.
-->

**862 operations across 732 paths.** 264 carry hand-written
request and response schemas; the other 598 carry `x-schema-status: unspecified`,
which means "unknown", not "empty" — read the linked source file for those.

### Sessions (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/sessions` | — |
| `POST` | `/v1/sessions` | — |
| `GET` | `/v1/sessions/{sessionId}` | — |

### System (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/health` | — |

### World Model (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/world/entities` | — |
| `POST` | `/v1/world/entities` | — |

### acos (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/acos/cycles` | `…/main.ts` |
| `POST` | `/v1/acos/cycles` | `…/main.ts` |
| `GET` | `/v1/acos/journal` | `…/main.ts` |
| `POST` | `/v1/acos/journal` | `…/main.ts` |
| `GET` | `/v1/acos/status` | `…/main.ts` |

### adaptive-router (2)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/adaptive-router/route` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/adaptive-router/stats` | `…/routes/aurora-services.ts` |

### agent-directory (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/agent-directory` | `…/main.ts` |

### agent-profiles (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/agent-profiles` | `…/main.ts` |
| `POST` | `/v1/agent-profiles` | `…/main.ts` |
| `DELETE` | `/v1/agent-profiles/{profileId}` | `…/main.ts` |
| `PATCH` | `/v1/agent-profiles/{profileId}` | `…/main.ts` |

### approvals (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/approvals` | `…/main.ts` |
| `POST` | `/v1/approvals/{approvalId}/resolve` | `…/main.ts` |

### artifacts (5)

| Method | Path | Source |
| --- | --- | --- |
| `DELETE` | `/v1/artifacts/{artifactId}` | `…/main.ts` |
| `PATCH` | `/v1/artifacts/{artifactId}` | `…/main.ts` |
| `GET` | `/v1/artifacts/{artifactId}/frame` | `…/main.ts` |
| `POST` | `/v1/artifacts/{artifactId}/frame` | `…/main.ts` |
| `POST` | `/v1/artifacts/{artifactId}/interactions` | `…/main.ts` |

### attention (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/attention/targets` | `…/routes/cognitive.ts` |

### attention-v2 (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/attention-v2/allocate` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/attention-v2/stats` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/attention-v2/target` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/attention-v2/targets` | `…/routes/aurora-services.ts` |

### aurora (18)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/aurora/alerts` | `…/main.ts` |
| `GET` | `/v1/aurora/enforcement` | `…/main.ts` |
| `GET` | `/v1/aurora/enforcement-summary` | `…/main.ts` |
| `GET` | `/v1/aurora/explain` | `…/main.ts` |
| `GET` | `/v1/aurora/export` | `…/main.ts` |
| `GET` | `/v1/aurora/fleet` | `…/main.ts` |
| `GET` | `/v1/aurora/fleet/members` | `…/main.ts` |
| `POST` | `/v1/aurora/fleet/members` | `…/main.ts` |
| `DELETE` | `/v1/aurora/fleet/members/{tenantId}` | `…/main.ts` |
| `GET` | `/v1/aurora/fleet/members/{tenantId}` | `…/main.ts` |
| `POST` | `/v1/aurora/fleet/members/{tenantId}/resume` | `…/main.ts` |
| `POST` | `/v1/aurora/fleet/sweep` | `…/main.ts` |
| `GET` | `/v1/aurora/fleet/sweeps` | `…/main.ts` |
| `GET` | `/v1/aurora/footprint` | `…/main.ts` |
| `GET` | `/v1/aurora/metrics` | `…/main.ts` |
| `GET` | `/v1/aurora/metrics.prom` | `…/main.ts` |
| `POST` | `/v1/aurora/purge-user` | `…/main.ts` |
| `GET` | `/v1/aurora/selfcheck` | `…/main.ts` |

### auth (8)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/auth/github-app/callback` | `…/main.ts` |
| `POST` | `/auth/login/token` | `…/main.ts` |
| `POST` | `/auth/logout` | `…/main.ts` |
| `GET` | `/auth/mcp/callback` | `…/main.ts` |
| `GET` | `/auth/me` | `…/main.ts` |
| `GET` | `/auth/model-oauth/callback` | `…/main.ts` |
| `GET` | `/auth/oidc/callback` | `…/main.ts` |
| `GET` | `/auth/oidc/start` | `…/main.ts` |

### auto-approvals (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/auto-approvals` | `…/main.ts` |
| `POST` | `/v1/auto-approvals` | `…/main.ts` |
| `DELETE` | `/v1/auto-approvals/{ruleId}` | `…/main.ts` |
| `POST` | `/v1/auto-approvals/{ruleId}/enabled` | `…/main.ts` |
| `GET` | `/v1/auto-approvals/decisions` | `…/main.ts` |

### automation-git-sources (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/automation-git-sources` | `…/main.ts` |
| `POST` | `/v1/automation-git-sources` | `…/main.ts` |
| `DELETE` | `/v1/automation-git-sources/{sourceId}` | `…/main.ts` |
| `PATCH` | `/v1/automation-git-sources/{sourceId}` | `…/main.ts` |
| `POST` | `/v1/automation-git-sources/{sourceId}/apply` | `…/main.ts` |
| `POST` | `/v1/automation-git-sources/{sourceId}/plan` | `…/main.ts` |

### automation-responders (7)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/automation-responders` | `…/main.ts` |
| `POST` | `/v1/automation-responders` | `…/main.ts` |
| `DELETE` | `/v1/automation-responders/{responderId}` | `…/main.ts` |
| `PATCH` | `/v1/automation-responders/{responderId}` | `…/main.ts` |
| `POST` | `/v1/automation-responders/{responderId}/credential` | `…/main.ts` |
| `POST` | `/v1/automation-responders/{responderId}/events` | `…/main.ts` |
| `POST` | `/v1/automation-responders/{responderId}/heartbeat` | `…/main.ts` |

### automations (7)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/automations` | `…/main.ts` |
| `POST` | `/v1/automations` | `…/main.ts` |
| `GET` | `/v1/automations/{automationId}` | `…/main.ts` |
| `PATCH` | `/v1/automations/{automationId}` | `…/main.ts` |
| `POST` | `/v1/automations/{automationId}/dispatch` | `…/main.ts` |
| `GET` | `/v1/automations/{automationId}/runs` | `…/main.ts` |
| `POST` | `/v1/automations/{automationId}/webhook` | `…/main.ts` |

### autopilot (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/autopilot` | `…/main.ts` |
| `POST` | `/v1/autopilot` | `…/main.ts` |
| `POST` | `/v1/autopilot/run-due` | `…/main.ts` |
| `GET` | `/v1/autopilot/runs` | `…/main.ts` |

### backends (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/backends` | `…/main.ts` |
| `POST` | `/v1/backends` | `…/main.ts` |
| `DELETE` | `/v1/backends/{backendId}` | `…/main.ts` |
| `PATCH` | `/v1/backends/{backendId}` | `…/main.ts` |
| `GET` | `/v1/backends/{backendId}/health` | `…/main.ts` |

### benchmarks (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/benchmarks/run` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/benchmarks/runs` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/benchmarks/stats` | `…/routes/aurora-services.ts` |

### budget (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/budget/status` | `…/routes/aurora-services.ts` |

### canvas (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/canvas` | `…/main.ts` |
| `GET` | `/canvas/*` | `…/main.ts` |

### capabilities (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/capabilities` | `…/main.ts` |
| `GET` | `/v1/capabilities/assessment` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/capabilities/search` | `…/main.ts` |

### causal (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/causal/impact` | `…/routes/aurora-services.ts` |

### causal-graph (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/causal-graph/edge` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/causal-graph/node` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/causal-graph/paths` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/causal-graph/stats` | `…/routes/aurora-services.ts` |

### channel-routing-rules (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/channel-routing-rules` | `…/main.ts` |
| `POST` | `/v1/channel-routing-rules` | `…/main.ts` |
| `DELETE` | `/v1/channel-routing-rules/{ruleId}` | `…/main.ts` |
| `PATCH` | `/v1/channel-routing-rules/{ruleId}` | `…/main.ts` |

### channels (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/channels/adapters` | `…/main.ts` |
| `GET` | `/v1/channels/routes` | `…/main.ts` |
| `POST` | `/v1/channels/webhook/{platform}` | `…/main.ts` |

### checkpoints (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/checkpoints` | `…/main.ts` |
| `POST` | `/v1/checkpoints` | `…/main.ts` |
| `DELETE` | `/v1/checkpoints/{checkpointId}` | `…/main.ts` |
| `GET` | `/v1/checkpoints/{checkpointId}` | `…/main.ts` |
| `POST` | `/v1/checkpoints/{checkpointId}/diff` | `…/main.ts` |
| `POST` | `/v1/checkpoints/{checkpointId}/restore` | `…/main.ts` |

### checkpoints-usage (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/checkpoints-usage` | `…/main.ts` |

### cognitive (24)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/cognitive/allocation` | `…/main.ts` |
| `POST` | `/v1/cognitive/allocation` | `…/main.ts` |
| `GET` | `/v1/cognitive/arbitrations` | `…/main.ts` |
| `POST` | `/v1/cognitive/attention/allocate` | `…/main.ts` |
| `POST` | `/v1/cognitive/attention/preempt` | `…/main.ts` |
| `GET` | `/v1/cognitive/budget` | `…/main.ts` |
| `POST` | `/v1/cognitive/budget` | `…/main.ts` |
| `GET` | `/v1/cognitive/curiosity` | `…/main.ts` |
| `POST` | `/v1/cognitive/cycle` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/cognitive/goals` | `…/main.ts` |
| `POST` | `/v1/cognitive/goals` | `…/main.ts` |
| `POST` | `/v1/cognitive/goals/arbitrate` | `…/main.ts` |
| `GET` | `/v1/cognitive/health` | `…/main.ts` |
| `GET` | `/v1/cognitive/intake` | `…/main.ts` |
| `POST` | `/v1/cognitive/intake` | `…/main.ts` |
| `GET` | `/v1/cognitive/mode` | `…/main.ts` |
| `POST` | `/v1/cognitive/mode` | `…/main.ts` |
| `GET` | `/v1/cognitive/objects` | `…/main.ts` |
| `POST` | `/v1/cognitive/objects` | `…/main.ts` |
| `POST` | `/v1/cognitive/objects/{id}/complete` | `…/main.ts` |
| `POST` | `/v1/cognitive/objects/{id}/interrupt` | `…/main.ts` |
| `POST` | `/v1/cognitive/objects/{id}/iterations` | `…/main.ts` |
| `GET` | `/v1/cognitive/reflection` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/cognitive/reflections` | `…/main.ts` |

### cognitive-state (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/cognitive-state` | `…/routes/cognitive.ts` |
| `GET` | `/v1/cognitive-state/history` | `…/routes/cognitive.ts` |
| `POST` | `/v1/cognitive-state/reset` | `…/routes/cognitive.ts` |
| `GET` | `/v1/cognitive-state/tasks` | `…/routes/cognitive.ts` |
| `GET` | `/v1/cognitive-state/tasks/{taskId}` | `…/routes/cognitive.ts` |

### cognitive-telemetry (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/cognitive-telemetry/cost` | `…/routes/aurora-services.ts` |

### cognitive-trace (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/cognitive-trace` | `…/routes/cognitive.ts` |

### composition (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/composition/component` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/composition/compose` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/composition/stats` | `…/routes/aurora-services.ts` |

### computer-use (9)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/computer-use/fill-form` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/computer-use/find-element` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/computer-use/screenshot` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/computer-use/stats` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/computer-use/tasks` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/computer-use/tasks` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/computer-use/tasks/{id}/execute` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/computer-use/tasks/{id}/rollback` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/computer-use/visual-grounding` | `…/routes/aurora-services.ts` |

### connectors (8)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/connectors` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/connectors` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/connectors/{id}/calendar` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/connectors/{id}/calendar` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/connectors/{id}/email/send` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/connectors/{id}/iot/devices` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/connectors/{id}/sync` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/connectors/stats` | `…/routes/aurora-services.ts` |

### constitution (11)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/constitution/amendments` | `…/main.ts` |
| `POST` | `/v1/constitution/check` | `…/main.ts` |
| `GET` | `/v1/constitution/compliance` | `…/main.ts` |
| `GET` | `/v1/constitution/decisions` | `…/main.ts` |
| `GET` | `/v1/constitution/identity` | `…/main.ts` |
| `POST` | `/v1/constitution/identity/mission` | `…/main.ts` |
| `GET` | `/v1/constitution/principles` | `…/main.ts` |
| `POST` | `/v1/constitution/principles` | `…/main.ts` |
| `POST` | `/v1/constitution/principles/{principleId}/amend` | `…/main.ts` |
| `POST` | `/v1/constitution/principles/{principleId}/retire` | `…/main.ts` |
| `POST` | `/v1/constitution/why` | `…/routes/aurora-services.ts` |

### context (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/context/optimize` | `…/routes/aurora-services.ts` |

### counterfactual (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/counterfactual/calibration` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/counterfactual/simulations` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/counterfactual/simulations` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/counterfactual/simulations/{simId}/outcome` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/counterfactual/simulations/{simId}/recommend` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/counterfactual/simulations/{simId}/scenarios` | `…/routes/aurora-services.ts` |

### critic (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/critic/resolve` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/critic/review` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/critic/reviews` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/critic/stats` | `…/routes/aurora-services.ts` |

### cron (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/cron/fire` | `…/main.ts` |

### dashboard (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/dashboard/metrics` | `…/routes/aurora-services.ts` |

### decision-feedback (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/decision-feedback` | `…/main.ts` |
| `GET` | `/v1/decision-feedback/candidates` | `…/main.ts` |
| `POST` | `/v1/decision-feedback/reconcile` | `…/main.ts` |
| `GET` | `/v1/decision-feedback/summary` | `…/main.ts` |

### decisions (9)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/decisions` | `…/main.ts` |
| `POST` | `/v1/decisions` | `…/main.ts` |
| `GET` | `/v1/decisions/{decisionId}` | `…/main.ts` |
| `POST` | `/v1/decisions/{decisionId}/decide` | `…/main.ts` |
| `POST` | `/v1/decisions/{decisionId}/dissent` | `…/main.ts` |
| `POST` | `/v1/decisions/{decisionId}/options` | `…/main.ts` |
| `POST` | `/v1/decisions/{decisionId}/outcome` | `…/main.ts` |
| `POST` | `/v1/decisions/lifecycle` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/decisions/why` | `…/routes/aurora-services.ts` |

### decisions-calibration (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/decisions-calibration` | `…/main.ts` |

### delegation-candidates (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/delegation-candidates` | `…/main.ts` |

### delegation-policy (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/delegation-policy` | `…/main.ts` |
| `POST` | `/v1/delegation-policy` | `…/main.ts` |

### delegations (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/delegations` | `…/main.ts` |
| `POST` | `/v1/delegations/{linkId}/activate` | `…/main.ts` |
| `GET` | `/v1/delegations/{linkId}/assessment` | `…/main.ts` |
| `POST` | `/v1/delegations/{linkId}/detach` | `…/main.ts` |
| `POST` | `/v1/delegations/harvest` | `…/main.ts` |
| `POST` | `/v1/delegations/sync` | `…/main.ts` |

### detached-workers (8)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/detached-workers` | `…/main.ts` |
| `POST` | `/v1/detached-workers` | `…/main.ts` |
| `DELETE` | `/v1/detached-workers/{workerId}` | `…/main.ts` |
| `GET` | `/v1/detached-workers/{workerId}` | `…/main.ts` |
| `GET` | `/v1/detached-workers/{workerId}/approvals` | `…/main.ts` |
| `POST` | `/v1/detached-workers/{workerId}/approvals/{approvalId}/resolve` | `…/main.ts` |
| `POST` | `/v1/detached-workers/{workerId}/commands` | `…/main.ts` |
| `GET` | `/v1/detached-workers/{workerId}/events/stream` | `…/main.ts` |

### digital-twin (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/digital-twin` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/constraints` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/learn` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/preferences` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/projects` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/digital-twin/stats` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/sync` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/tools` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/digital-twin/workflows` | `…/routes/aurora-services.ts` |

### domain-experts (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/domain-experts` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/domain-experts/{id}` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/domain-experts/compliance` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/domain-experts/consult` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/domain-experts/consultations` | `…/routes/aurora-services.ts` |

### economy (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/economy/trade` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/economy/trade/{id}/accept` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/economy/trades` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/economy/wallets` | `…/routes/aurora-services.ts` |

### effort-defaults (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/effort-defaults` | `…/main.ts` |

### effort-levels (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/effort-levels` | `…/main.ts` |

### environment (15)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/environment/actions` | `…/main.ts` |
| `POST` | `/v1/environment/actions` | `…/main.ts` |
| `POST` | `/v1/environment/actions/{actionId}/approve` | `…/main.ts` |
| `POST` | `/v1/environment/actions/{actionId}/complete` | `…/main.ts` |
| `POST` | `/v1/environment/actions/{actionId}/rollback` | `…/main.ts` |
| `POST` | `/v1/environment/actions/{actionId}/start` | `…/main.ts` |
| `POST` | `/v1/environment/actions/{actionId}/verify` | `…/main.ts` |
| `GET` | `/v1/environment/habits` | `…/main.ts` |
| `POST` | `/v1/environment/habits` | `…/main.ts` |
| `GET` | `/v1/environment/inventory` | `…/main.ts` |
| `GET` | `/v1/environment/projects` | `…/main.ts` |
| `POST` | `/v1/environment/projects` | `…/main.ts` |
| `GET` | `/v1/environment/resources` | `…/main.ts` |
| `POST` | `/v1/environment/resources` | `…/main.ts` |
| `POST` | `/v1/environment/resources/{resourceId}/status` | `…/main.ts` |

### estimation (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/estimation/ingest` | `…/main.ts` |
| `GET` | `/v1/estimation/profile` | `…/main.ts` |
| `GET` | `/v1/estimation/samples` | `…/main.ts` |

### event-bus (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/event-bus/events` | `…/routes/cognitive.ts` |
| `GET` | `/v1/event-bus/stats` | `…/routes/cognitive.ts` |
| `GET` | `/v1/event-bus/trace/{traceId}` | `…/routes/cognitive.ts` |

### evolution (18)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/evolution/candidates` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/baseline` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/evaluations` | `…/main.ts` |
| `GET` | `/v1/evolution/candidates/{candidateId}/readiness` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/regression` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/retire` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/stage` | `…/main.ts` |
| `POST` | `/v1/evolution/candidates/{candidateId}/usage` | `…/main.ts` |
| `GET` | `/v1/evolution/composition` | `…/main.ts` |
| `GET` | `/v1/evolution/gaps` | `…/main.ts` |
| `POST` | `/v1/evolution/gaps` | `…/main.ts` |
| `POST` | `/v1/evolution/gaps/{gapId}/dismiss` | `…/main.ts` |
| `GET` | `/v1/evolution/index` | `…/main.ts` |
| `GET` | `/v1/evolution/journal` | `…/main.ts` |
| `POST` | `/v1/evolution/retirement-sweep` | `…/main.ts` |
| `GET` | `/v1/evolution/workflows` | `…/main.ts` |
| `POST` | `/v1/evolution/workflows` | `…/main.ts` |

### experience (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/experience/distill` | `…/main.ts` |
| `GET` | `/v1/experience/proposals` | `…/main.ts` |
| `POST` | `/v1/experience/proposals/{proposalId}/apply` | `…/main.ts` |
| `POST` | `/v1/experience/proposals/{proposalId}/reject` | `…/main.ts` |

### experience-compiler (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/experience-compiler/compile` | `…/main.ts` |
| `GET` | `/v1/experience-compiler/experiences` | `…/main.ts` |
| `GET` | `/v1/experience-compiler/skills` | `…/main.ts` |

### experiments (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/experiments` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/experiments` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/experiments/{id}/complete` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/experiments/{id}/result` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/experiments/{id}/start` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/experiments/stats` | `…/routes/aurora-services.ts` |

### explain (2)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/explain/full` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/explain/task` | `…/routes/observability.ts` |

### failures (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/failures` | `…/main.ts` |
| `POST` | `/v1/failures/classify` | `…/main.ts` |
| `GET` | `/v1/failures/patterns` | `…/main.ts` |
| `GET` | `/v1/failures/recommendations` | `…/main.ts` |
| `GET` | `/v1/failures/stats` | `…/main.ts` |

### federated (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/federated/air-gap` | `…/routes/aurora-services.ts` |
| `PUT` | `/v1/federated/air-gap` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/federated/data-policies` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/federated/data-policies` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/federated/infer` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/federated/models` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/federated/models` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/federated/nodes` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/federated/nodes` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/federated/stats` | `…/routes/aurora-services.ts` |

### feedback (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/feedback/outcome` | `…/routes/aurora-services.ts` |

### fleet (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/fleet/alerts` | `…/routes/observability.ts` |
| `GET` | `/v1/fleet/status` | `…/routes/observability.ts` |

### github-apps (12)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/github-apps` | `…/main.ts` |
| `POST` | `/v1/github-apps` | `…/main.ts` |
| `PATCH` | `/v1/github-apps/{appConfigId}` | `…/main.ts` |
| `POST` | `/v1/github-apps/{appConfigId}/installations/start` | `…/main.ts` |
| `POST` | `/v1/github-apps/{appConfigId}/private-keys` | `…/main.ts` |
| `PATCH` | `/v1/github-apps/{appConfigId}/private-keys/{keyId}` | `…/main.ts` |
| `POST` | `/v1/github-apps/{appConfigId}/webhook-secrets` | `…/main.ts` |
| `PATCH` | `/v1/github-apps/{appConfigId}/webhook-secrets/{keyId}` | `…/main.ts` |
| `GET` | `/v1/github-apps/events` | `…/main.ts` |
| `GET` | `/v1/github-apps/installations` | `…/main.ts` |
| `DELETE` | `/v1/github-apps/installations/{installationId}` | `…/main.ts` |
| `PATCH` | `/v1/github-apps/installations/{installationId}` | `…/main.ts` |

### goal-stack (5)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/goal-stack` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/goal-stack/{id}/progress` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/goal-stack/active` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/goal-stack/metrics` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/goal-stack/tree` | `…/routes/aurora-services.ts` |

### goals (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/goals/why` | `…/routes/aurora-services.ts` |

### harness (9)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/harness/entries` | `…/main.ts` |
| `POST` | `/v1/harness/entries` | `…/main.ts` |
| `DELETE` | `/v1/harness/entries/{entryId}` | `…/main.ts` |
| `POST` | `/v1/harness/projection` | `…/main.ts` |
| `POST` | `/v1/harness/prune` | `…/main.ts` |
| `GET` | `/v1/harness/refinements` | `…/main.ts` |
| `POST` | `/v1/harness/refinements` | `…/main.ts` |
| `POST` | `/v1/harness/refinements/{refinementId}/outcome` | `…/main.ts` |
| `POST` | `/v1/harness/refinements/{refinementId}/rollback` | `…/main.ts` |

### harvest-assessments (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/harvest-assessments` | `…/main.ts` |

### harvest-policy (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/harvest-policy` | `…/main.ts` |
| `POST` | `/v1/harvest-policy` | `…/main.ts` |

### harvest-review (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/harvest-review` | `…/main.ts` |
| `POST` | `/v1/harvest-review/{assessmentId}/resolve` | `…/main.ts` |

### health (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/health/report` | `…/routes/observability.ts` |

### hooks (7)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/hooks` | `…/main.ts` |
| `POST` | `/v1/hooks` | `…/main.ts` |
| `DELETE` | `/v1/hooks/{ruleId}` | `…/main.ts` |
| `POST` | `/v1/hooks/{ruleId}/enabled` | `…/main.ts` |
| `GET` | `/v1/hooks/config` | `…/main.ts` |
| `POST` | `/v1/hooks/config` | `…/main.ts` |
| `GET` | `/v1/hooks/firings` | `…/main.ts` |

### hypotheses (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/hypotheses/why` | `…/routes/aurora-services.ts` |

### initiative (17)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/initiative/budget` | `…/main.ts` |
| `POST` | `/v1/initiative/budget` | `…/main.ts` |
| `GET` | `/v1/initiative/digests` | `…/main.ts` |
| `POST` | `/v1/initiative/digests` | `…/main.ts` |
| `POST` | `/v1/initiative/evaluate` | `…/main.ts` |
| `GET` | `/v1/initiative/initiatives` | `…/main.ts` |
| `POST` | `/v1/initiative/initiatives` | `…/main.ts` |
| `POST` | `/v1/initiative/initiatives/{initiativeId}/delivered` | `…/main.ts` |
| `POST` | `/v1/initiative/initiatives/{initiativeId}/dismiss` | `…/main.ts` |
| `POST` | `/v1/initiative/initiatives/{initiativeId}/escalate` | `…/main.ts` |
| `POST` | `/v1/initiative/initiatives/{initiativeId}/feedback` | `…/main.ts` |
| `GET` | `/v1/initiative/intake` | `…/main.ts` |
| `POST` | `/v1/initiative/intake` | `…/main.ts` |
| `GET` | `/v1/initiative/watchers` | `…/main.ts` |
| `POST` | `/v1/initiative/watchers` | `…/main.ts` |
| `POST` | `/v1/initiative/watchers/{watcherId}/enabled` | `…/main.ts` |
| `POST` | `/v1/initiative/watchers/run` | `…/main.ts` |

### knowledge (2)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/knowledge/reindex` | `…/main.ts` |
| `GET` | `/v1/knowledge/search` | `…/main.ts` |

### learned-world (5)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/learned-world/entity` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/learned-world/query` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/learned-world/relation` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/learned-world/rule` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/learned-world/stats` | `…/routes/aurora-services.ts` |

### learning (22)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/learning/candidates` | `…/main.ts` |
| `POST` | `/v1/learning/candidates` | `…/main.ts` |
| `POST` | `/v1/learning/candidates/{candidateId}/evaluation` | `…/main.ts` |
| `POST` | `/v1/learning/candidates/{candidateId}/promote` | `…/main.ts` |
| `POST` | `/v1/learning/candidates/{candidateId}/review` | `…/main.ts` |
| `POST` | `/v1/learning/candidates/{candidateId}/rollback` | `…/main.ts` |
| `POST` | `/v1/learning/consolidate` | `…/routes/cognitive.ts` |
| `GET` | `/v1/learning/effectiveness` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/learning/learn` | `…/routes/cognitive.ts` |
| `GET` | `/v1/learning/refinement-reviews` | `…/main.ts` |
| `GET` | `/v1/learning/refinements` | `…/main.ts` |
| `POST` | `/v1/learning/refinements` | `…/main.ts` |
| `POST` | `/v1/learning/refinements/{refinementId}/rollback` | `…/main.ts` |
| `POST` | `/v1/learning/refinements/plan` | `…/main.ts` |
| `GET` | `/v1/learning/releases` | `…/main.ts` |
| `POST` | `/v1/learning/releases` | `…/main.ts` |
| `POST` | `/v1/learning/releases/{releaseId}/baseline` | `…/main.ts` |
| `POST` | `/v1/learning/releases/{releaseId}/evaluate` | `…/main.ts` |
| `POST` | `/v1/learning/releases/{releaseId}/outcomes` | `…/main.ts` |
| `POST` | `/v1/learning/releases/{releaseId}/rollback` | `…/main.ts` |
| `POST` | `/v1/learning/releases/{releaseId}/sign` | `…/main.ts` |
| `GET` | `/v1/learning/summary` | `…/routes/aurora-services.ts` |

### long-horizon-memory (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/long-horizon-memory` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/long-horizon-memory` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/long-horizon-memory/consolidate` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/long-horizon-memory/stats` | `…/routes/aurora-services.ts` |

### marketplace (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/marketplace/list` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/marketplace/request` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/marketplace/search` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/marketplace/stats` | `…/routes/aurora-services.ts` |

### mcp (11)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/mcp/elicitations` | `…/main.ts` |
| `POST` | `/v1/mcp/elicitations/{elicitationId}/resolve` | `…/main.ts` |
| `GET` | `/v1/mcp/schema-cache` | `…/main.ts` |
| `GET` | `/v1/mcp/servers` | `…/main.ts` |
| `DELETE` | `/v1/mcp/servers/{name}` | `…/main.ts` |
| `POST` | `/v1/mcp/servers/http` | `…/main.ts` |
| `POST` | `/v1/mcp/servers/stdio` | `…/main.ts` |
| `GET` | `/v1/mcp/stateless` | `…/main.ts` |
| `POST` | `/v1/mcp/stateless` | `…/main.ts` |
| `DELETE` | `/v1/mcp/stateless/{name}` | `…/main.ts` |
| `POST` | `/v1/mcp/stateless/{name}/refresh` | `…/main.ts` |

### media (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/media/images/providers` | `…/main.ts` |
| `GET` | `/v1/media/jobs` | `…/main.ts` |
| `GET` | `/v1/media/jobs/{jobId}` | `…/main.ts` |
| `POST` | `/v1/media/jobs/{jobId}/cancel` | `…/main.ts` |
| `POST` | `/v1/media/jobs/{jobId}/poll` | `…/main.ts` |
| `GET` | `/v1/media/videos/providers` | `…/main.ts` |

### memories (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/memories/{memoryId}/promote` | `…/main.ts` |

### memory (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/memory/consolidate` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/memory/providers/status` | `…/main.ts` |
| `POST` | `/v1/memory/recall` | `…/routes/cognitive.ts` |
| `POST` | `/v1/memory/store` | `…/routes/cognitive.ts` |

### memory-graph (15)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/memory-graph/anchors` | `…/main.ts` |
| `POST` | `/v1/memory-graph/anchors` | `…/main.ts` |
| `POST` | `/v1/memory-graph/anchors/{anchorId}/progress` | `…/main.ts` |
| `POST` | `/v1/memory-graph/consolidate` | `…/main.ts` |
| `POST` | `/v1/memory-graph/contradictions` | `…/main.ts` |
| `GET` | `/v1/memory-graph/health` | `…/main.ts` |
| `POST` | `/v1/memory-graph/insights` | `…/main.ts` |
| `POST` | `/v1/memory-graph/insights/materialize` | `…/main.ts` |
| `GET` | `/v1/memory-graph/memories` | `…/main.ts` |
| `POST` | `/v1/memory-graph/memories` | `…/main.ts` |
| `DELETE` | `/v1/memory-graph/memories/{memoryId}` | `…/main.ts` |
| `GET` | `/v1/memory-graph/memories/{memoryId}/neighborhood` | `…/main.ts` |
| `POST` | `/v1/memory-graph/recall` | `…/main.ts` |
| `POST` | `/v1/memory-graph/relations` | `…/main.ts` |
| `POST` | `/v1/memory-graph/sweep` | `…/main.ts` |

### meta-controller (11)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/meta-controller/alerts` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/alerts/{alertId}/acknowledge` | `…/routes/meta-controller.ts` |
| `GET` | `/v1/meta-controller/config` | `…/routes/meta-controller.ts` |
| `PATCH` | `/v1/meta-controller/config` | `…/routes/meta-controller.ts` |
| `GET` | `/v1/meta-controller/health` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/insights` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/mode` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/plan` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/profile` | `…/routes/meta-controller.ts` |
| `GET` | `/v1/meta-controller/stats` | `…/routes/meta-controller.ts` |
| `POST` | `/v1/meta-controller/why` | `…/routes/aurora-services.ts` |

### metrics (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/metrics` | `…/routes/observability.ts` |
| `GET` | `/v1/metrics` | `…/routes/observability.ts` |

### microagents (7)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/microagents` | `…/main.ts` |
| `POST` | `/v1/microagents` | `…/main.ts` |
| `DELETE` | `/v1/microagents/{microagentId}` | `…/main.ts` |
| `POST` | `/v1/microagents/{microagentId}/approve` | `…/main.ts` |
| `POST` | `/v1/microagents/{microagentId}/enabled` | `…/main.ts` |
| `POST` | `/v1/microagents/{microagentId}/feedback` | `…/main.ts` |
| `POST` | `/v1/microagents/recall` | `…/main.ts` |

### model-auth (6)

| Method | Path | Source |
| --- | --- | --- |
| `DELETE` | `/v1/model-auth/codex` | `…/main.ts` |
| `POST` | `/v1/model-auth/codex/activate` | `…/main.ts` |
| `GET` | `/v1/model-auth/codex/models` | `…/main.ts` |
| `POST` | `/v1/model-auth/codex/poll` | `…/main.ts` |
| `POST` | `/v1/model-auth/codex/start` | `…/main.ts` |
| `GET` | `/v1/model-auth/codex/status` | `…/main.ts` |

### model-capabilities (7)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/model-capabilities` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/model-capabilities` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/model-capabilities/{modelId}` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/model-capabilities/{modelId}/benchmark` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/model-capabilities/{modelId}/outcome` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/model-capabilities/select` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/model-capabilities/stats` | `…/routes/aurora-services.ts` |

### model-configurations (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/model-configurations` | `…/main.ts` |
| `POST` | `/v1/model-configurations` | `…/main.ts` |
| `DELETE` | `/v1/model-configurations/{configurationId}` | `…/main.ts` |
| `PATCH` | `/v1/model-configurations/{configurationId}` | `…/main.ts` |

### model-oauth-sources (6)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/model-oauth-sources` | `…/main.ts` |
| `POST` | `/v1/model-oauth-sources` | `…/main.ts` |
| `DELETE` | `/v1/model-oauth-sources/{sourceId}` | `…/main.ts` |
| `PATCH` | `/v1/model-oauth-sources/{sourceId}` | `…/main.ts` |
| `POST` | `/v1/model-oauth-sources/{sourceId}/logout` | `…/main.ts` |
| `POST` | `/v1/model-oauth-sources/{sourceId}/start` | `…/main.ts` |

### model-prices (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/model-prices` | `…/main.ts` |
| `POST` | `/v1/model-prices` | `…/main.ts` |
| `DELETE` | `/v1/model-prices/{route}` | `…/main.ts` |

### model-selection (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/model-selection/select` | `…/routes/cognitive.ts` |

### models (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/models/orchestrate` | `…/routes/aurora-services.ts` |

### multi-hypothesis (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/multi-hypothesis` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis/{id}/calibrate` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis/{id}/evidence` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis/{id}/start-testing` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/multi-hypothesis/chains` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/multi-hypothesis/evidence-graph` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis/reason` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/multi-hypothesis/stats` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multi-hypothesis/supersede` | `…/routes/aurora-services.ts` |

### multimodal (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/multimodal/analyses` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/audio` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/cad` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/document` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/image` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/map` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/ocr` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/multimodal/stats` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/timeseries` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/multimodal/video` | `…/routes/aurora-services.ts` |

### multiworld (9)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/multiworld/analyses` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses/{analysisId}/conflicts` | `…/main.ts` |
| `GET` | `/v1/multiworld/analyses/{analysisId}/future-tree` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses/{analysisId}/resolve` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses/{analysisId}/scenarios` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses/{analysisId}/scenarios/{scenarioId}/outcome` | `…/main.ts` |
| `POST` | `/v1/multiworld/analyses/{analysisId}/views` | `…/main.ts` |
| `GET` | `/v1/multiworld/perspectives` | `…/main.ts` |

### neural-core (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/neural-core/activate` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/neural-core/pattern` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/neural-core/stats` | `…/routes/aurora-services.ts` |

### neural-fusion (4)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/neural-fusion/consolidate` | `…/main.ts` |
| `GET` | `/v1/neural-fusion/patterns` | `…/main.ts` |
| `POST` | `/v1/neural-fusion/similar` | `…/main.ts` |
| `GET` | `/v1/neural-fusion/stats` | `…/main.ts` |

### pipeline (7)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/pipeline/{id}/execute` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/pipeline/{id}/rollback` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/pipeline/issues` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/pipeline/issues` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/pipeline/runs` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/pipeline/start` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/pipeline/stats` | `…/routes/aurora-services.ts` |

### planner-v2 (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/planner-v2` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/planner-v2` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/planner-v2/{id}/activate` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/planner-v2/{id}/step` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/planner-v2/stats` | `…/routes/aurora-services.ts` |

### planning (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/planning/goal-driven` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/planning/plan` | `…/routes/cognitive.ts` |
| `POST` | `/v1/planning/why` | `…/routes/aurora-services.ts` |

### plans (13)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/plans` | `…/main.ts` |
| `POST` | `/v1/plans` | `…/main.ts` |
| `GET` | `/v1/plans/{planId}` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/abandon` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/delegate` | `…/main.ts` |
| `GET` | `/v1/plans/{planId}/delegation-report` | `…/main.ts` |
| `GET` | `/v1/plans/{planId}/delegations` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/delegations/sync` | `…/main.ts` |
| `GET` | `/v1/plans/{planId}/estimation` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/estimation/apply` | `…/main.ts` |
| `GET` | `/v1/plans/{planId}/progress` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/revise` | `…/main.ts` |
| `POST` | `/v1/plans/{planId}/steps/{stepKey}` | `…/main.ts` |

### platforms (14)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/platforms/discord/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/feishu/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/github-app/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/google-chat/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/line/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/matrix/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/mattermost/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/signal/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/slack/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/teams/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/telegram/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/twilio/webhook` | `…/main.ts` |
| `GET` | `/v1/platforms/whatsapp/webhook` | `…/main.ts` |
| `POST` | `/v1/platforms/whatsapp/webhook` | `…/main.ts` |

### plugins (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/plugins/wasi` | `…/main.ts` |
| `POST` | `/v1/plugins/wasi` | `…/main.ts` |
| `DELETE` | `/v1/plugins/wasi/{pluginId}` | `…/main.ts` |

### proactive (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/proactive/anticipate` | `…/routes/aurora-services.ts` |

### providers (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/providers` | `…/main.ts` |
| `POST` | `/v1/providers/{providerId}/credentials/reset` | `…/main.ts` |

### questions (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/questions` | `…/main.ts` |
| `POST` | `/v1/questions/{questionId}/answer` | `…/main.ts` |
| `POST` | `/v1/questions/{questionId}/cancel` | `…/main.ts` |

### reasoning (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/reasoning/reason` | `…/routes/cognitive.ts` |

### repositories (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/repositories/import` | `…/main.ts` |

### repository-providers (12)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/repository-providers` | `…/main.ts` |
| `POST` | `/v1/repository-providers` | `…/main.ts` |
| `DELETE` | `/v1/repository-providers/{providerId}` | `…/main.ts` |
| `PATCH` | `/v1/repository-providers/{providerId}` | `…/main.ts` |
| `POST` | `/v1/repository-providers/{providerId}/import` | `…/main.ts` |
| `GET` | `/v1/repository-providers/{providerId}/operations` | `…/main.ts` |
| `GET` | `/v1/repository-providers/{providerId}/repositories` | `…/main.ts` |
| `GET` | `/v1/repository-providers/{providerId}/repositories/{repositoryId}/reviews` | `…/main.ts` |
| `POST` | `/v1/repository-providers/{providerId}/repositories/{repositoryId}/reviews` | `…/main.ts` |
| `POST` | `/v1/repository-providers/{providerId}/repositories/{repositoryId}/reviews/{reviewNumber}/close` | `…/main.ts` |
| `POST` | `/v1/repository-providers/{providerId}/repositories/{repositoryId}/reviews/{reviewNumber}/comments` | `…/main.ts` |
| `POST` | `/v1/repository-providers/{providerId}/repositories/{repositoryId}/reviews/{reviewNumber}/merge` | `…/main.ts` |

### reputation (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/reputation` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/reputation/endorse` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/reputation/interaction` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/reputation/stats` | `…/routes/aurora-services.ts` |

### research (7)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/research` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/research/{id}/report` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/research/queries` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/research/reports` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/research/results` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/research/stats` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/research/verify-source` | `…/routes/aurora-services.ts` |

### resources (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/resources/allocate` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/resources/analyze` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/resources/stats` | `…/routes/aurora-services.ts` |

### risk (9)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/risk/assess` | `…/main.ts` |
| `GET` | `/v1/risk/assessment` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/risk/assessments` | `…/main.ts` |
| `GET` | `/v1/risk/policy` | `…/main.ts` |
| `POST` | `/v1/risk/policy` | `…/main.ts` |
| `GET` | `/v1/risk/posture` | `…/main.ts` |
| `GET` | `/v1/risk/rules` | `…/main.ts` |
| `POST` | `/v1/risk/rules` | `…/main.ts` |
| `POST` | `/v1/risk/rules/{ruleId}/enabled` | `…/main.ts` |

### root (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/` | `…/main.ts` |

### routing (3)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/routing/learn` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/routing/smart` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/routing/why` | `…/routes/aurora-services.ts` |

### run-task (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/run-task` | `…/routes/cognitive.ts` |

### schedules (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/schedules` | `…/main.ts` |
| `POST` | `/v1/schedules` | `…/main.ts` |
| `POST` | `/v1/schedules/{jobId}/status` | `…/main.ts` |

### sdk (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/sdk/config` | `…/routes/aurora-services.ts` |
| `PUT` | `/v1/sdk/config` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/sdk/extensions` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/sdk/extensions` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/sdk/extensions/{id}` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/sdk/extensions/{id}/reviews` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/sdk/instances` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/sdk/instances` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/sdk/instances/{id}/execute` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/sdk/stats` | `…/routes/aurora-services.ts` |

### search (1)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/search/unified` | `…/routes/aurora-services.ts` |

### secret-sources (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/secret-sources` | `…/main.ts` |
| `POST` | `/v1/secret-sources` | `…/main.ts` |
| `DELETE` | `/v1/secret-sources/{sourceId}` | `…/main.ts` |
| `PATCH` | `/v1/secret-sources/{sourceId}` | `…/main.ts` |
| `POST` | `/v1/secret-sources/{sourceId}/refresh` | `…/main.ts` |

### secrets (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/secrets` | `…/main.ts` |
| `POST` | `/v1/secrets` | `…/main.ts` |
| `DELETE` | `/v1/secrets/{secretId}` | `…/main.ts` |

### self-debugging (5)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/self-debugging/bug` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/self-debugging/bugs` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/self-debugging/fix` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/self-debugging/heal` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/self-debugging/stats` | `…/routes/aurora-services.ts` |

### self-model (14)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/self-model` | `…/main.ts` |
| `POST` | `/v1/self-model/advise` | `…/main.ts` |
| `GET` | `/v1/self-model/awareness` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/self-model/beliefs` | `…/main.ts` |
| `POST` | `/v1/self-model/capabilities` | `…/main.ts` |
| `GET` | `/v1/self-model/decision-inputs` | `…/main.ts` |
| `GET` | `/v1/self-model/gaps` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/self-model/goals` | `…/main.ts` |
| `POST` | `/v1/self-model/hypotheses` | `…/main.ts` |
| `GET` | `/v1/self-model/limitations` | `…/main.ts` |
| `POST` | `/v1/self-model/reflect` | `…/main.ts` |
| `POST` | `/v1/self-model/strategy` | `…/main.ts` |
| `GET` | `/v1/self-model/strategy-advice` | `…/main.ts` |
| `POST` | `/v1/self-model/strategy-outcomes` | `…/main.ts` |

### session-archives (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/session-archives` | `…/main.ts` |

### session-budgets (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/session-budgets` | `…/main.ts` |
| `POST` | `/v1/session-budgets/defaults` | `…/main.ts` |

### session-modes (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/session-modes` | `…/main.ts` |
| `GET` | `/v1/session-modes/defaults` | `…/main.ts` |
| `POST` | `/v1/session-modes/defaults` | `…/main.ts` |

### session-search (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/session-search` | `…/main.ts` |

### sessions (71)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/sessions/{sessionId}/archive` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/artifact-interactions` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/artifacts` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/artifacts` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/attachments` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/browser` | `…/main.ts` |
| `DELETE` | `/v1/sessions/{sessionId}/budget` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/budget` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/budget` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/cache/config` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/cache/plan` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/changes` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/channels/send` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/close` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/code` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/code/definition` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/code/diagnostics/run` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/code/references` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/code/symbols` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/commands` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/commands` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/commands/{name}/render` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/cost` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/diagnostics` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/effort` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/effort` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/events` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/events/stream` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/export` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/fanout` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/file` | `…/main.ts` |
| `PUT` | `/v1/sessions/{sessionId}/file` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/files` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/fork` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/git/branches` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/git/branches` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/git/commit` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/git/switch` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/inbox` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/instructions` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/media/image` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/media/image/upscale` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/media/video` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/media/video/jobs` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/media/video/upscale` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/messages` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/messages/direct` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/mode` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/mode` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/mode/history` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/repository-sync` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/restore` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/review` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/roster` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/shells` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/shells` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/shells/{shellId}/output` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/shells/{shellId}/stop` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/stuck` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/subagents` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/subagents/{name}` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/subagents/{name}/materialize` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/subagents/materialize-all` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/tasks/monitor` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/tasks/stop` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/terminal` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/verification` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/verification/run` | `…/main.ts` |
| `DELETE` | `/v1/sessions/{sessionId}/worktrees` | `…/main.ts` |
| `GET` | `/v1/sessions/{sessionId}/worktrees` | `…/main.ts` |
| `POST` | `/v1/sessions/{sessionId}/worktrees` | `…/main.ts` |

### settings (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/settings/effective` | `…/main.ts` |

### shared-learning (4)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/shared-learning` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/shared-learning` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/shared-learning/{id}/adopt` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/shared-learning/stats` | `…/routes/aurora-services.ts` |

### simulations (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/simulations` | `…/main.ts` |
| `POST` | `/v1/simulations` | `…/main.ts` |
| `POST` | `/v1/simulations/{simId}/recommend` | `…/main.ts` |
| `POST` | `/v1/simulations/{simId}/scenarios` | `…/main.ts` |
| `GET` | `/v1/simulations/calibration` | `…/main.ts` |

### skills (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/skills` | `…/main.ts` |
| `POST` | `/v1/skills/candidates` | `…/main.ts` |
| `POST` | `/v1/skills/candidates/{directory}/promote` | `…/main.ts` |
| `POST` | `/v1/skills/hub/install` | `…/main.ts` |
| `POST` | `/v1/skills/hub/refresh` | `…/main.ts` |
| `GET` | `/v1/skills/hub/search` | `…/main.ts` |
| `GET` | `/v1/skills/hub/sources` | `…/main.ts` |
| `POST` | `/v1/skills/hub/sources` | `…/main.ts` |
| `POST` | `/v1/skills/similar` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/skills/transfer` | `…/routes/aurora-services.ts` |

### sleep-cycle (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/sleep-cycle/cycles` | `…/main.ts` |
| `POST` | `/v1/sleep-cycle/schedule` | `…/main.ts` |

### slo (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/slo` | `…/routes/observability.ts` |

### society (32)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/society/authority/apply` | `…/main.ts` |
| `POST` | `/v1/society/authority/apply-all` | `…/main.ts` |
| `GET` | `/v1/society/authority/audit` | `…/main.ts` |
| `GET` | `/v1/society/authority/templates` | `…/main.ts` |
| `POST` | `/v1/society/authority/templates` | `…/main.ts` |
| `DELETE` | `/v1/society/authority/templates/{templateId}` | `…/main.ts` |
| `GET` | `/v1/society/authority/templates/{templateId}` | `…/main.ts` |
| `GET` | `/v1/society/budget` | `…/main.ts` |
| `POST` | `/v1/society/budget` | `…/main.ts` |
| `GET` | `/v1/society/deliberations` | `…/main.ts` |
| `POST` | `/v1/society/deliberations` | `…/main.ts` |
| `POST` | `/v1/society/deliberations/{id}/perspectives` | `…/main.ts` |
| `POST` | `/v1/society/deliberations/{id}/resolve` | `…/main.ts` |
| `GET` | `/v1/society/messages` | `…/main.ts` |
| `POST` | `/v1/society/messages` | `…/main.ts` |
| `POST` | `/v1/society/messages/{messageId}/acknowledge` | `…/main.ts` |
| `GET` | `/v1/society/meta-monitor` | `…/main.ts` |
| `GET` | `/v1/society/overview` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/society/probation` | `…/main.ts` |
| `GET` | `/v1/society/roles` | `…/main.ts` |
| `POST` | `/v1/society/roles` | `…/main.ts` |
| `POST` | `/v1/society/roles/{roleId}/profile` | `…/main.ts` |
| `POST` | `/v1/society/roles/retire-underperformers` | `…/main.ts` |
| `GET` | `/v1/society/tasks` | `…/main.ts` |
| `POST` | `/v1/society/tasks` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/award` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/bids` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/cancel` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/execute` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/outcome` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/pause` | `…/main.ts` |
| `POST` | `/v1/society/tasks/{taskId}/resume` | `…/main.ts` |

### strategy (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/strategy/recommendations` | `…/routes/aurora-services.ts` |

### swarm (5)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/swarm` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/swarm` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/swarm/{id}/member` | `…/routes/aurora-services.ts` |
| `POST` | `/v1/swarm/{id}/task` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/swarm/stats` | `…/routes/aurora-services.ts` |

### system (2)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/system/diagnosis` | `…/routes/aurora-services.ts` |
| `GET` | `/v1/system/health` | `…/routes/aurora-services.ts` |

### telemetry (3)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/telemetry/insights` | `…/main.ts` |
| `GET` | `/v1/telemetry/stats` | `…/main.ts` |
| `GET` | `/v1/telemetry/traces` | `…/main.ts` |

### trust (10)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/trust/decisions` | `…/main.ts` |
| `POST` | `/v1/trust/evaluate` | `…/main.ts` |
| `GET` | `/v1/trust/pins` | `…/main.ts` |
| `POST` | `/v1/trust/pins` | `…/main.ts` |
| `DELETE` | `/v1/trust/pins/{kind}/{artifactId}` | `…/main.ts` |
| `GET` | `/v1/trust/policy` | `…/main.ts` |
| `POST` | `/v1/trust/policy` | `…/main.ts` |
| `GET` | `/v1/trust/publishers` | `…/main.ts` |
| `POST` | `/v1/trust/publishers` | `…/main.ts` |
| `DELETE` | `/v1/trust/publishers/{id}` | `…/main.ts` |

### uncertainty (5)

| Method | Path | Source |
| --- | --- | --- |
| `POST` | `/v1/uncertainty/assert` | `…/main.ts` |
| `GET` | `/v1/uncertainty/calibration` | `…/main.ts` |
| `GET` | `/v1/uncertainty/claims` | `…/main.ts` |
| `GET` | `/v1/uncertainty/confident` | `…/main.ts` |
| `GET` | `/v1/uncertainty/uncertain` | `…/main.ts` |

### usage (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/usage` | `…/main.ts` |

### user-model (17)

| Method | Path | Source |
| --- | --- | --- |
| `DELETE` | `/v1/user-model/{userId}` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/advice` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/alignment` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}/claims` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/claims` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}/frustration` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}/goals` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/goals` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/milestones` | `…/main.ts` |
| `POST` | `/v1/user-model/{userId}/signals` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}/state` | `…/main.ts` |
| `GET` | `/v1/user-model/{userId}/timeline` | `…/main.ts` |
| `POST` | `/v1/user-model/advice/{adviceId}/outcome` | `…/main.ts` |
| `POST` | `/v1/user-model/claims/{claimId}/consent` | `…/main.ts` |
| `POST` | `/v1/user-model/claims/{claimId}/correct` | `…/main.ts` |
| `POST` | `/v1/user-model/claims/{claimId}/retract` | `…/main.ts` |

### web-search (1)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/web-search/providers` | `…/main.ts` |

### world (17)

| Method | Path | Source |
| --- | --- | --- |
| `GET` | `/v1/world/calibration` | `…/main.ts` |
| `GET` | `/v1/world/causality` | `…/main.ts` |
| `POST` | `/v1/world/causality` | `…/main.ts` |
| `POST` | `/v1/world/causality/{linkId}/observations` | `…/main.ts` |
| `GET` | `/v1/world/consistency` | `…/main.ts` |
| `GET` | `/v1/world/entities/{entityId}/reassess` | `…/main.ts` |
| `GET` | `/v1/world/entities/{entityId}/state` | `…/main.ts` |
| `GET` | `/v1/world/entities/{entityId}/temporal` | `…/main.ts` |
| `GET` | `/v1/world/events` | `…/main.ts` |
| `POST` | `/v1/world/events` | `…/main.ts` |
| `GET` | `/v1/world/predictions` | `…/main.ts` |
| `POST` | `/v1/world/predictions` | `…/main.ts` |
| `POST` | `/v1/world/predictions/{predictionId}/resolve` | `…/main.ts` |
| `POST` | `/v1/world/relations` | `…/main.ts` |
| `GET` | `/v1/world/scopes/{scope}` | `…/main.ts` |
| `POST` | `/v1/world/simulate` | `…/main.ts` |
| `POST` | `/v1/world/states` | `…/main.ts` |

<!-- END GENERATED_ENDPOINT_INDEX -->
