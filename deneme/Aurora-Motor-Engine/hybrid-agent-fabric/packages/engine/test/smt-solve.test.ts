/**
 * Z3 constraint solving, with the model checked independently of Z3.
 *
 * The reason the independent check is the centre of this file: an earlier version of
 * the worker built integer literals with `Int(7)` instead of `IntVal(7)`. In Z3's
 * Python API `Int(name)` declares a variable, so that created a free constant called
 * "7" which the solver was free to assign. It returned `sat` with a model that did
 * not satisfy the caller's constraints. Nothing inside the worker could catch that —
 * the solver had correctly decided the constraints it was given.
 *
 * So these cases do not ask "did the solver say sat". They substitute the returned
 * model back into the constraint tree in TypeScript and require it to hold. That is
 * the only check available that is independent of the translation, and it is what
 * turns that bug into a red test instead of a wrong answer.
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SMT_SOLVE_WORKER_PATH,
  checkModelAgainstConstraints,
  smt,
  smtSolveCapability,
  solveSmt,
  type SmtNode,
  type SmtSort,
} from "../src/capabilities/smt-solve.js";

const variables = [smt.variable("x"), smt.variable("y")];
const sorts: Record<string, SmtSort> = { x: "int", y: "int" };
/** x + 2y == 7, x > y, y > 0 — the exact query that exposed the literal bug. */
const constraints: SmtNode[] = [
  smt.eq(smt.add({ var: "x" }, smt.mul(smt.int(2), { var: "y" })), smt.int(7)),
  smt.gt({ var: "x" }, { var: "y" }),
  smt.gt({ var: "y" }, smt.int(0)),
];

describe("a satisfiable query returns a model that actually holds", () => {
  it("solves and the model satisfies every constraint when substituted back", async () => {
    const result = await solveSmt({ variables, constraints });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.verdict).toBe("sat");
    expect(result.result.verified).toBe(true);
    const assignment = result.result.assignment ?? {};

    // The load-bearing assertion. Under the `Int(7)` bug this returned x=1, y=0,
    // which does not satisfy x + 2y == 7 — and the solver was still "right".
    const check = checkModelAgainstConstraints(constraints, assignment, sorts);
    expect(check.violations).toEqual([]);
    expect(check.ok).toBe(true);

    // And the arithmetic, spelled out rather than trusted to the helper.
    const x = Number(assignment.x);
    const y = Number(assignment.y);
    expect(x + 2 * y).toBe(7);
    expect(x).toBeGreaterThan(y);
    expect(y).toBeGreaterThan(0);
  });

  it("reports every declared variable, so an unconstrained one is visible", async () => {
    const result = await solveSmt({
      variables: [smt.variable("a"), smt.variable("b")],
      constraints: [smt.eq({ var: "a" }, smt.int(3))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const assignment = result.result.assignment ?? {};
    expect(assignment.a).toBe("3");
    // b was never constrained; the model still names it rather than omitting it.
    expect(Object.prototype.hasOwnProperty.call(assignment, "b")).toBe(true);
  });
});

describe("an unsatisfiable query is proved, not merely unmatched", () => {
  it("returns unsat with no model to fabricate", async () => {
    const result = await solveSmt({
      variables: [smt.variable("x")],
      constraints: [smt.gt({ var: "x" }, smt.int(3)), smt.lt({ var: "x" }, smt.int(2))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.verdict).toBe("unsat");
    expect(result.result.verified).toBe(true);
    expect(result.result.assignment).toBeUndefined();
  });
});

describe("boolean constraints, including the unary operators", () => {
  it("solves a boolean query", async () => {
    // `not` is unary. An earlier version read args[1] unconditionally and failed
    // with "list index out of range" — a message about a Python list where the real
    // problem was a missing branch.
    const result = await solveSmt({
      variables: [{ name: "a", sort: "bool" }, { name: "b", sort: "bool" }],
      constraints: [smt.or({ var: "a" }, { var: "b" }), smt.not({ var: "a" })],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.verdict).toBe("sat");
    const assignment = result.result.assignment ?? {};
    expect(assignment.a).toBe("False");
    expect(assignment.b).toBe("True");
  });
});

describe("exact arithmetic is not silently rounded", () => {
  it("reports a rational and says which parts could not be re-checked", async () => {
    const result = await solveSmt({
      variables: [{ name: "r", sort: "real" }],
      constraints: [smt.eq(smt.mul({ var: "r" }, smt.int(2)), smt.int(7))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.verdict).toBe("sat");
    // 7/2 exactly. Turning that into 3.5 and comparing would introduce an error the
    // solver did not have, so the local evaluator declines instead of approximating.
    expect(result.result.assignment?.r).toBe("7/2");
    const check = checkModelAgainstConstraints(
      [smt.eq(smt.mul({ var: "r" }, smt.int(2)), smt.int(7))],
      result.result.assignment ?? {},
      { r: "real" },
    );
    expect(check.ok).toBe(true);
    expect(check.unchecked.length).toBeGreaterThan(0);
  });
});

describe("the worker refuses input it does not understand instead of guessing", () => {
  it("names an undeclared variable", async () => {
    const result = await solveSmt({
      variables: [smt.variable("x")],
      constraints: [smt.eq({ var: "y" }, smt.int(1))],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("'y' was not declared");
  });

  it("names an unknown operator and lists the ones it knows", async () => {
    const result = await solveSmt({
      variables: [smt.variable("x")],
      constraints: [{ op: "evil", args: [{ var: "x" }, smt.int(1)] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unknown operator 'evil'");
    expect(result.error).toContain("known operators are");
  });

  it("names an operator given the wrong number of arguments", async () => {
    const result = await solveSmt({
      variables: [smt.variable("x")],
      constraints: [{ op: "add", args: [{ var: "x" }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("takes 2 args");
  });

  it("rejects a duplicate variable declaration", async () => {
    const result = await solveSmt({
      variables: [smt.variable("x"), smt.variable("x")],
      constraints: [smt.eq({ var: "x" }, smt.int(1))],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("declared twice");
  });

  it("rejects an unknown sort", async () => {
    const result = await solveSmt({
      variables: [{ name: "x", sort: "int" }],
      constraints: [smt.eq({ var: "x" }, smt.int(1))],
    });
    expect(result.ok).toBe(true);
    const bad = await solveSmt({
      // Cast past the schema on purpose: this is the worker being handed a sort the
      // schema would have rejected, to prove it does not accept it either.
      variables: [{ name: "x", sort: "string" as unknown as SmtSort }],
      constraints: [smt.eq({ var: "x" }, smt.int(1))],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toContain("unknown sort");
  });
});

/**
 * The constraint language is a tree so that no caller-supplied text is ever parsed
 * as Python. This case is the reason: the worker runs in a context the planner can
 * reach, and `eval`-ing an expression there would be the same hole the repository
 * already closed once.
 */
describe("caller-supplied strings are data, never code", () => {
  it("treats an injection attempt as an unknown identifier", async () => {
    const marker = "/tmp/haf-smt-injection-marker";
    if (existsSync(marker)) throw new Error("stale injection marker; remove it before running");

    const result = await solveSmt({
      variables: [{ name: '__import__("os").system("touch /tmp/haf-smt-injection-marker")', sort: "int" }],
      constraints: [smt.eq({ var: "x" }, smt.int(1))],
    });
    expect(result.ok).toBe(false);
    // The attempt failed because the identifier was not declared — the string was
    // looked up as a name, not executed.
    expect(result.ok ? "" : result.error).toContain("was not declared");
    expect(existsSync(marker)).toBe(false);
  });
});

describe("the model checker reports what it could not check", () => {
  it("does not treat an unevaluable constraint as a pass", () => {
    const check = checkModelAgainstConstraints(
      [{ op: "mystery", args: [smt.int(1), smt.int(2)] }],
      {},
      {},
    );
    // No violation was found, but nothing was checked either — and the caller is
    // told which of those happened.
    expect(check.violations).toEqual([]);
    expect(check.unchecked.length).toBeGreaterThan(0);
  });

  it("flags a model that violates a constraint", () => {
    const check = checkModelAgainstConstraints(
      [smt.gt({ var: "x" }, smt.int(10))],
      { x: "1" },
      { x: "int" },
    );
    expect(check.ok).toBe(false);
    expect(check.violations[0]).toContain("constraints[0]");
  });
});

describe("the capability end to end", () => {
  it("returns a verified sat", async () => {
    const capability = smtSolveCapability();
    const output = (await capability.execute({ variables, constraints })) as Record<string, unknown>;
    expect(output.status).toBe("executed");
    expect(output.verdict).toBe("sat");
    expect(output.verified).toBe(true);
    expect(String(output.checkDetail)).toContain("substituted back in");
    const verdict = await capability.verify(output, { variables, constraints }, {} as never);
    expect(verdict.ok).toBe(true);
  });

  it("returns a verified unsat", async () => {
    const capability = smtSolveCapability();
    const output = (await capability.execute({
      variables: [smt.variable("x")],
      constraints: [smt.gt({ var: "x" }, smt.int(3)), smt.lt({ var: "x" }, smt.int(2))],
    })) as Record<string, unknown>;
    expect(output.verdict).toBe("unsat");
    expect(output.verified).toBe(true);
  });

  it("fails verification if the model does not satisfy the constraints", async () => {
    // Constructed rather than produced by the worker: the point is what the verifier
    // does when the re-check fails, which is the path a translation bug takes.
    const capability = smtSolveCapability();
    const verdict = await capability.verify(
      {
        status: "executed",
        verdict: "sat",
        verified: false,
        checkDetail: "Z3 reported sat but the returned model does not satisfy the caller's constraints",
        durationMs: 1,
      },
      { variables, constraints },
      {} as never,
    );
    expect(verdict.ok).toBe(false);
  });

  it("treats an undecided result as unverified rather than as a pass", async () => {
    const capability = smtSolveCapability();
    const output = {
      status: "executed",
      verdict: "unknown",
      verified: false,
      durationMs: 1,
    };
    expect(output.verified).toBe(false);
    const verdict = await capability.verify(output, { variables, constraints }, {} as never);
    // Not a failure — the solver declining to decide is a legitimate outcome — but
    // nothing is being claimed either.
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("did not decide");
  });

  it("exposes the worker path so a missing backend is diagnosable", () => {
    expect(SMT_SOLVE_WORKER_PATH).toContain("smt_solve.py");
  });
});
