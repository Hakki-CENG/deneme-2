# Aurora vNext — 30 Fazlı Plan (kaynak: kullanıcı, 2026-10-06)

Bu, kullanıcının yapıştırdığı planın **yapılandırılmış transkripsiyonu**. Sıranın tek
kaynağı budur + `aurora-vnext-faz-takibi.md`. Faz atlanmayacak.

## Hedef (kullanıcının kendi cümlesiyle)

> Tek bir Aurora çekirdeği; mümkün olduğunca her dijital/entelektüel işi yapabilen,
> her alanda alanın en güçlü araçlarından yararlanabilen ve ölçüm sonucunda her
> alanda uzman sistemleri geçmeye çalışabilen, uzun süre çalışan, hatalarından
> öğrenen, kişisel Jarvis benzeri genel amaçlı ajan.

Claude Code / OpenHands / Codex / Hermes / Prime'ın güçlü tarafları **Aurora'dan
atılmayacak**; evrensel çekirdeğin altındaki **uzmanlık katmanlarına** dönüştürülecek.

**Yasak:** "Claude Code iyiyse Aurora coding-only olsun." Kapsam daraltılmayacak.
Memory, world model, proactive, society, self-improvement, research, security kalır.

**Teşhis:** breadth çok yüksek, depth domainlere göre dengesiz. İş = breadth'i koruyup
her domain'in depth'ini yükseltmek.

## Ana mimari akış

WORLD MODEL / MEMORY / USER MODEL → GOAL UNDERSTANDING → TASK CLASSIFICATION →
EXPERT/STRATEGY ROUTER → {CODING, RESEARCH, VISION, DATA, SCIENCE, SYSTEM EXPERT} →
MODEL ROUTER → TOOL ROUTER → EXECUTE → DOMAIN EVALUATOR → VERIFICATION →
RECOVERY/RETRY → LEARN → SKILL/STRATEGY UPDATE → MEMORY

---

## FAZ 0 — Gerçeği dondur, ölçüm sistemini kur ✅

- Tek authoritative doküman: `AURORA_SYSTEM_SPEC.md`; her modül için
  `implemented / wired / integrated / exercised / verified / production` ayrı tutulacak.
- `packages/eval/{domains,tasks,scenarios,evaluators,baselines,results,runners}`
- Task şeması: `taskId, domain, difficulty, input, constraints, allowedTools,
  expectedEvidence, successCriteria, verifier, budget`
- 14 metrik: Task Success, Verified Success, First-attempt Success, Recovery Success,
  False Success, Tool Efficiency, Latency, Cost, Context Usage, Memory Retrieval
  Quality, Planning Quality, Safety Violations, Regression, Long-Horizon Completion
- **Çıkış kriteri:** "Bu sürüm öncekinden gerçekten daha iyi mi?" sayısal cevaplanabilmeli.

## FAZ 1 — Universal Runtime Kernel 🟡 (1.2 ✅ 1.3 ✅ · 1.1, 1.4 açık)

Mevcut `HybridAgentEngine + UnifiedExecutionLoop` korunur. Yeni özellik değil,
**ortak çekirdeğin doğru davranması**.

- **1.1 Tek gerçek execution contract.** Her görev:
  `Goal → Understand → Recall → Plan → Route → Execute → Observe → Verify → Recover → Learn`.
  Başka servislerin kendi paralel execution path'ini yaratmasına izin verme.
- **1.2** Model route'u planning + understanding'e geçir. Hedef: tek Route'tan
  `understandingModel, planningModel, executionModel, verificationModel, criticModel`.
- **1.3** Kanonik kimlik her yerde `provider:model` (örn. `openai-compatible:bonsai-27b`).
  Registry / outcome store / router / planner / evaluation farklı kimlik kullanmayacak.
- **1.4 Core hook'lar default production contract olacak:**
  `Memory, Planning, Verification, Routing, Execution, Recovery` → **zorunlu**.
  `World Model, Society, Vision, Voice, Digital Twin` → optional kalabilir.
  Böylece Aurora küçülmez ama çekirdek deterministik olur.

## FAZ 2 — Model Fabric

Amaç tek model bulmak değil, **Aurora'yı modelden bağımsız** yapmak.
Profiller: Model Registry, Capability Profile, Context, Tool Calling, Vision, Audio,
Reasoning Profile, Latency, Cost, Reliability, Privacy, Locality.
Sonra aşamaya göre farklı model: `UNDERSTAND→A, PLAN→B, CODING→C, VISION→D, VERIFY→E`.
İlk gerçek model **Bonsai 27B**; mimari Bonsai + cloud + başka local + specialist +
future model birlikte çalışabilmeli.

## FAZ 3 — Meta Planner

Mevcut `TaskPlanner` iyi temel ama "tek plan üret ve uygula"ya yakın.
- **Hierarchical:** Goal → Strategic Objective → Milestones → DAG → Subtask → Atomic Actions
- **Dynamic replanning:** `old plan + new evidence + memory + world state + failure → new plan`
- **Strategy generation:** tek yöntem değil `Strategy A/B/C` üret, sonra seç.

## FAZ 4 — Expert Fabric  ← "gelecekteki en önemli yeni katman"

`packages/engine/src/experts/`. **Expert sadece prompt olmayacak.**
`ExpertDefinition` = Domain, Knowledge, Skills, Tools, Strategy, Model Policy, Planner,
Evaluator, Safety Policy, Memory Namespace, Benchmark Suite.

## FAZ 5 — Semantic Task Router

Keyword sınıflandırmayı (`"code"`, `"bug"`, `"refactor"`) **bırak**.
"Bu görev tam olarak hangi yetenekleri gerektiriyor?" → **multi-expert task** desteği.
Örnek: performans problemi + düzeltme + deployment riski = SWE + Performance + Security
+ Research + DevOps.

## FAZ 6 — Coding Expert

Claude Code / Codex / OpenHands / OpenCode / Prime'dan aşağı kalmayacak.
Repository Mapper, Code Search, AST, LSP, Dependency Graph, Build System, Test
Discovery, Issue Understanding, Patch Planner, Implementation, Test Generation, Test
Runner, Debugger, Profiler, Static Analysis, Security Analysis, Code Review, Git, CI,
PR, Rollback.
Loop: Requirement → Repo Understanding → Architecture → Plan → Implementation →
Compile → Tests → Static Analysis → Security → Review → Hidden Verification → accept/reject.
**Çok önemli:** Aurora "kod çalıştı" diye **kendisi karar vermeyecek** —
compiler/test/security/static analysis karar verecek.

## FAZ 7 — Coding Expert Arena

Aynı task'ı Aurora / Claude Code / Codex / OpenHands / OpenCode / Prime'da çalıştır.
Ölç: Correctness, Tests, Regression, Security, Latency, Cost, Tool Efficiency, Recovery.
`Win / Draw / Loss` kaydet → "Aurora bu task family'de %X daha başarılı."

## FAZ 8 — Research / Knowledge Expert

Search, Web, PDF, Source Ranking, Citation, Claim Extraction, Contradiction Detection,
Freshness, Evidence Graph, Fact Checking, Synthesis, Research Verifier.
Mevcut provenance korunur. Evaluator: citation correctness, source quality, claim
support, coverage, contradiction, temporal validity.

## FAZ 9 — Science / Math / Data Expert

- **Math:** LLM reasoning + Python + CAS + symbolic verifier + numerical verifier + proof checker
- **Data:** Python, SQL, Pandas, Statistics, Visualization, Experimentation, ML, Reproducibility
- **Science:** paper retrieval, evidence synthesis, experiment design, data analysis, simulation, reproducibility
- **LLM tek karar verici olmamalı**; harici doğrulayıcı araçlar şart.

## FAZ 10 — Computer Use Expert

Screenshot → Vision → UI Grounding → Mouse → Keyboard → Clipboard → Window Management
→ Accessibility API → Action Verification. Sadece Chrome değil, Windows/Linux
uygulamaları da.

## FAZ 11 — Connector / Personal Assistant Fabric

GitHub, Google Drive, Calendar, Email, Discord, Telegram, Slack, Notion, Tasks,
Contacts, Files, Cloud Storage… Her connector `read/write/delete/send/share/execute`
yetkilerini **ayrı** taşır.
Credential: `Connector → Credential Broker → Least Privilege → Approval → Action → Audit`.

## FAZ 12 — Voice + Vision + Multimodal

`Microphone → Streaming STT → Aurora → Reasoning → Tool → Streaming TTS`.
**Barge-in:** kullanıcı konuşurken Aurora kesip dinleyebilmeli.
Vision: `Camera → Frame/Event Detection → Vision Model → Temporal Memory → Aurora`.
`jarvis-surface` içindeki **simüle placeholder'ları gerçek backend'lerden ayır**.

## FAZ 13 — Agent Society 2.0

Mevcut society **kaldırılmayacak**; gerçek uzman ekibe dönüşecek
(Architect, Researcher, Coder, Tester, Security, Reviewer).
**Sırf çok ajan olsun diye çağırma** — Aurora "multi-agent bu task'ta faydalı mı?" diye karar versin.
Agent contract: role, goal, scope, budget, permissions, input contract, output contract, evidence.
**Negotiation:** gerçek disagreement resolution (Coder vs Security vs Reviewer).

## FAZ 14 — Long-Horizon Jarvis

`Project → Goal → Milestone → Task → Subtask → Checkpoint` persistent.
Bugün → yarın → gelecek hafta aynı işi sürdür.
Test: tek seferlik benchmark yerine **Hours/Days/Weeks** ölçeğinde görevler.
Ölç: context continuity, memory continuity, goal continuity, recovery, drift, task completion.

## FAZ 15 — Proactive Intelligence

`event → initiative` yerine:
`world state + user model + long-term goals + calendar + unfinished tasks + past
behavior + opportunity detection → goal hypothesis → value estimate → notification →
approval → execution`.

## FAZ 16 — Self-Improvement 2.0

Mevcut sistem korunur, mutation operator'ları sabitlikten çıkar.
`Failure → Failure Analysis → Hypothesis → Candidate Strategy A/B/C → Arena →
Benchmark → Winner → Promotion` = **strategy evolution**.

## FAZ 17 — Capability Acquisition 2.0

Mevcut zincir (failure → gap → contract → code → static → sandbox → test → broker
registration → retry) iyi. Ama "model istediği kodu yazsın, import edelim" **yapma**.
`Generated Capability → Sandbox → Static → Unit → Adversarial → Security → Performance
→ Human approval if high risk → Signed package → Registry`.

## FAZ 18 — Expert Evaluator Fabric  ← "her alanda en iyi"nin gizli anahtarı

**Her expert kendi evaluator'üne sahip olacak.**
Coding: compile/tests/security/regression · Research: citations/sources/claims/
contradictions · Math: symbolic/numeric/proof · Vision: grounding/object consistency/
spatial accuracy · Data: statistical correctness/reproducibility.
→ Aurora'nın zekâsı **generation + verification**.

## FAZ 19 — Strategy Arena

Bir task için `Strategy A/B/C/D` üret (Claude-style loop, OpenHands-style loop,
Prime-style delegation, Aurora-native loop), sandbox'ta yarıştır.
Aurora "her zaman benim yöntemim" demesin.

## FAZ 20 — Model Arena

Bonsai / Model A / B / C / API / Local aynı task'ta.
Seçim: Task Type, Difficulty, Latency, Cost, Success, Reliability, Privacy.

## FAZ 21 — Memory 2.0

Mevcut memory kaldırılmaz. Dönüşüm:
`Memory → Recall → Belief → Decision → Action → Outcome → Updated Memory`.
Memory yalnız "daha önce ne olmuştu" değil, **"geçmiş deneyim bugünkü kararımı nasıl
değiştirmeli"** sorusunu da cevaplasın.
**`NeuralMemoryFusion` / `NeuralCognitiveCore`:** ya gerçek learned mekanizma ya isimler
dürüstleştirilsin (şu an önemli kısmı deterministic pattern/vector).

## FAZ 22 — World Model 2.0

Mevcut `predict/act/observe/compare/surprise/calibrate` korunur.
Eklenecek: structured state, causal relations, learned transition, uncertainty, counterfactual.

## FAZ 23 — Digital Twin'i gerçek yap

User, Projects, Devices, Tasks, Calendar, Goals, Resources, Constraints tek state
modelinde. "Bu haftaki görev yüküm nasıl?", "Gecikme riski nerede?", "Bu kararı
alırsam gelecek hafta ne değişir?" simüle edilebilsin.

## FAZ 24 — Federated / Distributed Aurora  ← en sona

Önce Laptop Aurora çalışsın. Sonra Laptop + Desktop + Server + Jetson/RPi.
`task → node selection → remote execution → result → verification`. **İlk aşamada yapma.**

## FAZ 25 — Gerçek Production State

`Postgres + NATS + Event Store + Snapshot + Lease + Worker` ana backbone olsun.
JSON yalnız config / local cache / export için.

## FAZ 26 — Engine parçalama

`engine.ts` ~5.5K satır. `EngineComposition, ExecutionComposition, MemoryComposition,
ModelComposition, SecurityComposition, ResearchComposition, CognitiveComposition,
IntegrationComposition`'a ayır. **Şimdi sırf güzel dursun diye yapma.**

## FAZ 27 — Security 2.0  ← ayrı sıra değil, P1'den itibaren her fazda zorunlu katman

Gerçek model üzerinde test: Prompt Injection, Tool Result Injection, Indirect Prompt
Injection, Data Exfiltration, Credential Theft, Confused Deputy, Sandbox Escape, Cross
Tenant, Browser Hijack, Malicious Skill, Supply Chain, Reward Hacking.
**Security input screening hata durumunda fail-open olmayacak:** subsystem çalışmıyorsa
`UNKNOWN`, **`SAFE` değil**.

## FAZ 28 — Domain Expert Fabric'i gerçek uzmanlığa çıkar

**"domain expert = farklı prompt" kesinlikle yapılmayacak.**
Gerçek expert = Domain Knowledge + Specialized Tools + Specialized Models + Specialized
Retrieval + Specialized Planner + Specialized Verifier + Specialized Benchmark.
Legal Expert ile Coding Expert aynı framework'ü paylaşabilir, içleri aynı olmaz.

## FAZ 29 — Her alan için alan haritası (Universal Capability Map)

Alanlar: Software Engineering, DevOps, System Administration, Cybersecurity Defense,
Research, Science, Mathematics, Data Science, Statistics, Business Analysis, Finance,
Legal Information, Education, Writing, Translation, Creative, Design, Image, Video,
Audio, Browser, Computer Use, Productivity, Communication, Project Management, Personal
Assistant, IoT, Robotics, Simulation, Knowledge Management, …
Her alan için: Capabilities, Tools, Models, Experts, Evaluators, Benchmarks, Gaps.

## FAZ 30 — "Her alanda en iyi" için gerçek yarış sistemi

`DOMAIN TASKS + REAL TASKS → ARENA → {MODEL, STRATEGY, EXPERT ARENA} → RESULTS →
FAILURE ANALYSIS → IMPROVEMENT → REGRESSION → RELEASE`. Sürekli gelişim motoru.

---

## Bağımlılık sırası (kullanıcının verdiği — bu sıra bozulmayacak)

```
P0 Measurement ✅
 ↓ P1 Runtime Kernel 🟡
 ↓ P2 Model Fabric
 ↓ P3 Meta Planner
 ↓ P4 Expert Fabric
 ↓  ├ FAZ 5 Semantic Task Router
 ↓  ├ P5/FAZ 6 Coding (+FAZ 7 Arena)
 ↓  ├ P8 Research
 ↓  ├ P9 Science/Data/Math
 ↓  ├ P10 Computer Use
 ↓  ├ P11 Connectors
 ↓  └ P12 Multimodal
 ↓ P13 Society
 ↓ P14 Long Horizon
 ↓ P15 Proactive
 ↓ P16 Self Improvement
 ↓ P17 Capability Acquisition
 ↓ P18 Evaluator Fabric
 ↓ P19 Strategy Arena
 ↓ P20 Model Arena
 ↓ P21 Memory 2.0
 ↓ P22 World Model
 ↓ P23 Digital Twin
 ↓ P24 Federation
 ↓ P25 Production State
 ↓ P26 Architecture Refactor
```
**Security ayrı bir sıra değil; P1'den itibaren her fazda zorunlu katman.**

## Kullanıcının önceliklendirmesi

**ŞİMDİ:** (1) gerçek LLM + gerçek embedding (Bonsai 27B) · (2) model identity/routing
· (3) planner → dynamic replanning · (4) Expert Fabric · (5) Coding Expert · (6) Benchmark/Arena
**SONRA:** Research, Science/Data/Math, Computer Use, Connectors, Voice, Vision,
Multi-Agent, Long-Horizon, Proactive
**EN SON:** Self-improvement 2.0, Capability acquisition 2.0, World model, Digital twin,
Federation, Embodiment, distributed cognition

## Başarı ölçütü değişiyor

Artık "kaç subsystem var?" ile değil: Coding / Research / Math / Data / Computer Use /
Vision / Long Horizon / Memory / Personal Assistant → **rakiplerle karşılaştır**.
Geride olunan alanda: `benchmark → failure analysis → expert/strategy/tool/model-routing/
verifier improvement` döngüsü.
