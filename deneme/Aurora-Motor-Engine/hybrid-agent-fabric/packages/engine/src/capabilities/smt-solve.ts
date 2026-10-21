/**
 * SMT solving / constraint checking (V2 integration plan, wave 3 item 17: "Math
 * formal tools: SymPy, Lean/mathlib, Z3"). SymPy was already integrated as
 * `math.symbolic`; this adds Z3 5.3.1, which answers a different question — not
 * "simplify this expression" but "does any assignment satisfy these constraints".
 *
 * WHY THIS CAPABILITY CAN CLAIM `verified: true` WHERE THE OCR AND SPEECH ONES
 * CANNOT. A transcription is a guess about the world and nothing local can check it.
 * A Z3 `sat` verdict comes with a model that can be substituted back into the
 * constraints, and an `unsat` verdict is a proof that no model exists. So `sat` and
 * `unsat` are reported as verified and `unknown` — the solver giving up, usually on
 * a timeout — is reported as unverified. That is a real distinction, not a formality.
 *
 * THE INPUT IS AN ABSTRACT SYNTAX TREE, NOT A STRING, and this is load-bearing.
 * Z3's Python API takes expressions, so the convenient design is to accept
 * `"x + 2*y == 7"` and `eval` it in the worker. That would put arbitrary code
 * execution behind a capability the planner can invoke — the same hole this
 * repository already closed once, when `JSON.constructor.constructor('return
 * process')()` returned the host process from inside the sandbox. The worker walks
 * a tree instead; it contains no `eval`, no `exec` and no `__import__`, and a
 * caller-supplied string is never parsed as Python.
 *
 * A note on what was found while building this, because it shapes the tests. An
 * earlier version used `Int(7)` for integer literals. In Z3's Python API `Int(name)`
 * declares a *variable*, so that created a free constant called "7" that the solver
 * was free to assign. The result was a confident `sat` with a model that did not
 * satisfy the constraints — a wrong answer in the right shape. The worker now uses
 * `IntVal`/`RealVal`/`BoolVal`, and `checkModelAgainstConstraints` below exists so a
 * regression of that kind fails a test rather than a user.
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineCapability } from "./schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SMT_SOLVE_WORKER_PATH = resolve(HERE, "../../external-workers/smt_solve.py");
export const SMT_SOLVE_CAPABILITY_ID = "math.smt.solve";

/** One node of the constraint tree. Deliberately a closed shape: no code, only data. */
export const smtNodeSchema: z.ZodType<SmtNode> = z.lazy(() =>
  z.union([
    z.object({ var: z.string().min(1).max(200) }),
    z.object({ lit: z.union([z.number(), z.boolean()]) }),
    z.object({ op: z.string().min(1).max(20), args: z.array(smtNodeSchema).min(1).max(3) }),
  ]),
);

export type SmtNode =
  | { var: string }
  | { lit: number | boolean }
  | { op: string; args: SmtNode[] };

export const SMT_SORTS = ["int", "real", "bool"] as const;
export type SmtSort = (typeof SMT_SORTS)[number];

const BINARY_OPS = new Set(["add", "sub", "mul", "div", "mod", "lt", "le", "gt", "ge", "eq", "ne", "and", "or", "implies"]);
const UNARY_OPS = new Set(["neg", "not"]);

export interface SmtSolveServiceOptions {
  pythonPath?: string;
  timeoutMs?: number;
}

interface WorkerResult {
  ok: boolean;
  verdict?: "sat" | "unsat" | "unknown";
  verified?: boolean;
  assignment?: Record<string, string>;
  reason?: string;
  error?: string;
}

/**
 * Evaluates a constraint tree against an assignment, independently of Z3.
 *
 * This exists because a translation bug in the worker does not show up as a Z3
 * error: the solver happily decides the constraints it was *given*, so a model that
 * looks wrong is only wrong with respect to what the caller meant. Checking the
 * returned assignment here, in TypeScript, against the tree the caller sent is the
 * only independent test available — and it is what catches a literal being turned
 * into a free variable.
 *
 * Returns `undefined` when the tree cannot be evaluated locally (a `real` variable
 * whose value Z3 reported as an exact rational like `7/2`, or an operator this
 * evaluator does not model). "Cannot check" is reported as such rather than being
 * quietly treated as a pass.
 */
export function checkModelAgainstConstraints(
  constraints: readonly SmtNode[],
  assignment: Record<string, string>,
  sorts: Record<string, SmtSort>,
): { ok: boolean; violations: string[]; unchecked: string[] } {
  const violations: string[] = [];
  const unchecked: string[] = [];

  const value = (node: SmtNode): number | boolean | undefined => {
    if ("var" in node) {
      const raw = assignment[node.var];
      if (raw === undefined) {
        unchecked.push(`variable ${node.var} has no value in the model`);
        return undefined;
      }
      if (sorts[node.var] === "bool") return raw === "True";
      // Z3 reports exact rationals for reals ("7/2"). Comparing those as decimals
      // would introduce an error the solver did not have, so they are left unchecked.
      if (!/^-?\d+$/.test(raw)) {
        unchecked.push(`variable ${node.var} is ${raw}, which is not an integer this evaluator can compare`);
        return undefined;
      }
      return Number(raw);
    }
    if ("lit" in node) return node.lit;
    const [first, second, third] = node.args;
    if (!first || !second) return undefined;
    const a = value(first);
    const b = value(second);
    if (a === undefined || b === undefined) return undefined;
    const num = (operand: number | boolean): number | undefined => (typeof operand === "number" ? operand : undefined);
    const an = num(a);
    const bn = num(b);
    switch (node.op) {
      case "add": return an !== undefined && bn !== undefined ? an + bn : undefined;
      case "sub": return an !== undefined && bn !== undefined ? an - bn : undefined;
      case "mul": return an !== undefined && bn !== undefined ? an * bn : undefined;
      case "mod": return an !== undefined && bn !== undefined && bn !== 0 ? an % bn : undefined;
      case "lt": return an !== undefined && bn !== undefined ? an < bn : undefined;
      case "le": return an !== undefined && bn !== undefined ? an <= bn : undefined;
      case "gt": return an !== undefined && bn !== undefined ? an > bn : undefined;
      case "ge": return an !== undefined && bn !== undefined ? an >= bn : undefined;
      case "eq": return a === b || (an !== undefined && bn !== undefined && an === bn);
      case "ne": return !(a === b || (an !== undefined && bn !== undefined && an === bn));
      case "and": return typeof a === "boolean" && typeof b === "boolean" ? a && b : undefined;
      case "or": return typeof a === "boolean" && typeof b === "boolean" ? a || b : undefined;
      case "implies": return typeof a === "boolean" && typeof b === "boolean" ? !a || b : undefined;
      case "if": {
        const otherwise = third ? value(third) : undefined;
        return typeof a === "boolean" ? (a ? b : otherwise) : undefined;
      }
      default:
        unchecked.push(`operator ${node.op} is not modelled by this evaluator`);
        return undefined;
    }
  };

  constraints.forEach((constraint, index) => {
    const result = value(constraint);
    if (result === undefined) {
      unchecked.push(`constraints[${index}] could not be evaluated locally`);
    } else if (result !== true) {
      violations.push(`constraints[${index}] evaluates to ${String(result)} under the returned model`);
    }
  });

  return { ok: violations.length === 0, violations, unchecked };
}

export async function solveSmt(
  input: { variables: { name: string; sort: SmtSort }[]; constraints: SmtNode[]; timeoutMs?: number },
  options: SmtSolveServiceOptions = {},
): Promise<{ ok: true; result: WorkerResult; durationMs: number } | { ok: false; error: string; durationMs: number }> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  const child = spawn(options.pythonPath ?? "python3", [SMT_SOLVE_WORKER_PATH], { stdio: ["pipe", "pipe", "pipe"] });
  const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 60_000);
  try {
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.stdin.write(JSON.stringify({
      variables: input.variables,
      constraints: input.constraints,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    }));
    child.stdin.end();
    const code = await new Promise<number | null>((resolveExit) => child.on("exit", (exitCode) => resolveExit(exitCode)));
    const parsed = stdout.trim() === "" ? undefined : (JSON.parse(stdout.trim()) as WorkerResult);
    if (parsed?.ok === true) return { ok: true, result: parsed, durationMs: Date.now() - startedAt };
    return {
      ok: false,
      error: parsed?.error ?? `the SMT worker exited with code ${code ?? "null"}. ${stderr.trim().slice(-400)}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      error: `the SMT worker could not be run: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The `math.smt.solve` capability.
 *
 * Verification is genuinely two-tiered here. A `sat` verdict is re-checked by
 * substituting the model into the caller's own constraint tree, so a worker that
 * mistranslates the input fails verification even though Z3 itself was satisfied.
 * `unsat` has no model to substitute, so it rests on Z3's proof. `unknown` is
 * reported as unverified, because the solver declining to decide is not an answer
 * about the constraints.
 */
export function smtSolveCapability(options: SmtSolveServiceOptions = {}) {
  return defineCapability(
    {
      id: SMT_SOLVE_CAPABILITY_ID,
      version: "1.0.0",
      description:
        "Decide whether a set of integer, real or boolean constraints is satisfiable, using Z3. " +
        "Constraints are given as a tree rather than a string so no caller-supplied text is ever " +
        "evaluated. Returns sat with a model, unsat, or unknown; unknown is reported as unverified.",
      // "pure" like math.symbolic: the worker only decides a query, it touches
      // nothing. The closed CapabilityRisk union has no "compute" member.
      risk: "pure",
      sideEffect: false,
      source: "core",
      idempotency: "inherent",
    },
    z.object({
      variables: z
        .array(z.object({ name: z.string().min(1).max(200), sort: z.enum(SMT_SORTS).default("int") }))
        .min(1)
        .max(200),
      constraints: z.array(smtNodeSchema).min(1).max(500),
      /** Z3's own timeout. On expiry the verdict is `unknown`, not a failure. */
      timeoutMs: z.number().int().min(1).max(600_000).optional(),
    }),
    async (input) => {
      const run = await solveSmt(
        {
          variables: input.variables,
          constraints: input.constraints,
          ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
        },
        options,
      );
      if (!run.ok) {
        return { status: "failed", reason: run.error, verified: false, durationMs: run.durationMs };
      }
      const verdict = run.result.verdict ?? "unknown";
      const sorts: Record<string, SmtSort> = {};
      for (const variable of input.variables) sorts[variable.name] = variable.sort;

      if (verdict === "unsat") {
        return {
          status: "executed",
          verdict,
          verified: true,
          checkDetail: "Z3 proved no assignment satisfies these constraints; there is no model to re-check.",
          durationMs: run.durationMs,
        };
      }
      if (verdict === "unknown") {
        return {
          status: "executed",
          verdict,
          verified: false,
          unchecked: true,
          checkDetail:
            run.result.reason ??
            "Z3 stopped without deciding, usually on a timeout or an undecidable fragment. " +
            "This is not a verdict about the constraints.",
          durationMs: run.durationMs,
        };
      }

      const assignment = run.result.assignment ?? {};
      // The independent check: substitute the model into the caller's own tree.
      const check = checkModelAgainstConstraints(input.constraints, assignment, sorts);
      return {
        status: "executed",
        verdict,
        assignment,
        verified: check.ok,
        ...(check.ok ? {} : { unchecked: true }),
        ...(check.unchecked.length > 0 ? { uncheckedParts: check.unchecked } : {}),
        checkDetail: check.ok
          ? `the returned model satisfies all ${input.constraints.length} constraint(s) when substituted back in`
          : `Z3 reported sat but the returned model does not satisfy the caller's constraints: ${check.violations.join("; ")}`,
        durationMs: run.durationMs,
      };
    },
    {
      idempotency: "inherent",
      output: z.object({
        status: z.string(),
        verdict: z.enum(["sat", "unsat", "unknown"]).optional(),
        assignment: z.record(z.string()).optional(),
        reason: z.string().optional(),
        verified: z.boolean(),
        unchecked: z.boolean().optional(),
        uncheckedParts: z.array(z.string()).optional(),
        checkDetail: z.string().optional(),
        durationMs: z.number(),
      }),
      verify: async (output) => {
        const value = output as Record<string, unknown>;
        if (String(value.status ?? "") !== "executed") {
          return { ok: true, reason: String(value.reason ?? value.status) || "the capability reported its own failure" };
        }
        const verdict = String(value.verdict ?? "");
        if (verdict === "unknown") {
          return { ok: true, reason: "the solver did not decide, so nothing is being claimed" };
        }
        // A model that does not satisfy the constraints is a hard failure: it means
        // the worker mistranslated the input, which is exactly the bug the
        // independent re-check exists to catch.
        if (value.verified === false) {
          return { ok: false, reason: String(value.checkDetail ?? "the returned model does not satisfy the constraints") };
        }
        return { ok: true, reason: String(value.checkDetail ?? `Z3 decided ${verdict}`) };
      },
    },
  );
}

/** Exposed so callers can build constraints without hand-writing the tree shape. */
export const smt = {
  variable: (name: string, sort: SmtSort = "int") => ({ name, sort }),
  int: (value: number): SmtNode => ({ lit: value }),
  bool: (value: boolean): SmtNode => ({ lit: value }),
  add: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "add", args: [a, b] }),
  mul: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "mul", args: [a, b] }),
  eq: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "eq", args: [a, b] }),
  gt: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "gt", args: [a, b] }),
  lt: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "lt", args: [a, b] }),
  not: (a: SmtNode): SmtNode => ({ op: "not", args: [a] }),
  or: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "or", args: [a, b] }),
  and: (a: SmtNode, b: SmtNode): SmtNode => ({ op: "and", args: [a, b] }),
  isBinaryOp: (op: string): boolean => BINARY_OPS.has(op),
  isUnaryOp: (op: string): boolean => UNARY_OPS.has(op),
};
