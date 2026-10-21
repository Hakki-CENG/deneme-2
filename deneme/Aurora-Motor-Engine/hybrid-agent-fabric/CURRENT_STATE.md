# Aurora — Current State

**Generated:** 2026-10-21 by `npm run docs:state -w @haf/eval`. Do not edit by hand;
regenerate it. See the header of `packages/eval/src/runner/state-docs-cli.ts`
for why this file is generated.

## Measured baseline

| Measurement | Value |
|---|---|
| Test files | 380 |
| Test cases (declared) | 3106 + 6 table-driven declaration(s), so the runner reports slightly more |
| Modules in the maturity register | 31 |
| Modules declared wired (hand-written) | 31 |
| Modules observed doing work in a real task (measured) | 28 |
| Acceptance gates in CI | 4 (`npm run eval:gates`) |

## What the levels mean

A module sits at the highest rung it can actually reach. Each rung implies the
ones before it.

| Level | Means |
|---|---|
| `implemented` | Source exists. |
| `initialized` | The engine constructs it. |
| `reachable` | Callable from a public entry point. |
| `integrated` | Wired into the real execution path (`wiredToEngine`). |
| `exercised` | A test drives it (`hasTests`). |
| `verified` | An acceptance gate measures it. |
| `production` | Verified **and** production evidence recorded in the maturity register (`productionEvidence`). Declaring `stable` is not enough: an acceptance gate measures this repository, which is what `verified` means. Nothing here can produce that evidence on its own, so the row is empty until somebody records it. |

**implemented: 0 · initialized: 0 · reachable: 3 · integrated: 0 · exercised: 25 · verified: 3 · production: 0**

## Honest summary

- The distinction that matters most here is `integrated` vs `exercised` vs
  `verified`. Most of this system is *exercised* — tests drive it. Far less is
  *verified*, meaning an acceptance gate would fail if it regressed.
- Only 0 module(s) reach `production`.
  That is not a defect report; it is the cost of using a strict definition.
- The full execution contract lives in
  `packages/engine/src/execution/execution-status.ts`:
  `skipped`, `simulated`, `unverified`, `unavailable` and `blocked` are each
  distinct from `succeeded`.

## Engine composition (FAZ 26)

FAZ 26 asks whether `engine.ts` should be split into eight compositions, and then
says not to do it just so it looks tidier. These are the measurements that decide it,
read from the file when this document was generated:

| Measurement | Value |
|---|---|
| Total lines | 5842 |
| Import statements | 268 |
| The constructor | 1744 (30% of the file) |
| The 42 methods | 3087 |

The constructor is the largest single block in the file and it is wiring, not
behaviour. A split along the plan's eight categories moves methods, so it would leave
that block untouched and the file still large. Line count on its own is therefore not
a justification — `isSizeAloneJustification()` returns `false` by design and a test
pins it. What would justify separating responsibilities is measured coupling, and
separating them needs a container that owns construction first, which is a larger
change than moving code between files.

## Verifying this document

```bash
npm run check          # typecheck + the full suite
npm run eval:gates     # the four acceptance gates
npm run docs:state -w @haf/eval   # regenerate these documents
```
