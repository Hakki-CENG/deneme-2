"""SMT solving via Z3 5.3.1. Reads JSON on stdin, writes JSON on stdout.

    {"variables": [{"name": "x", "sort": "int"}],
     "constraints": [{"op": "eq", "args": [...]}],
     "timeoutMs": 5000}

Why this capability exists: `math.symbolic` (SymPy) manipulates expressions. It
cannot decide whether a set of constraints has a solution. Z3 can, and — unlike the
OCR and speech capabilities in this repository — its answer is a machine-checked
result rather than a transcription, so a `sat`/`unsat` verdict is reported as
verified and an `unknown` one is not. That distinction is the whole point.

WHY THE INPUT IS AN ABSTRACT SYNTAX TREE AND NOT A STRING. The obvious design is to
take a constraint like `"x + 2*y == 7"` and hand it to Z3's Python API, which means
calling `eval` or `exec` on caller-supplied text. That would put arbitrary code
execution inside a worker that the planner can reach, which is the exact hole this
repository already closed once (a `JSON.constructor.constructor('return process')()`
escape that returned the host process). So the caller sends a tree and this file
walks it. There is no `eval`, no `exec`, no `__import__`, no `getattr` on anything
the caller controls, and no string is ever parsed as Python.

An unknown variable or an unknown operator is an error naming it, not a guess. Sort
mismatches are left to Z3, which reports them; this worker does not silently coerce
an integer into a real.

`unknown` is a real Z3 outcome, not a failure — it means the solver stopped without
deciding, usually on a timeout or an undecidable fragment. It is reported as
`verified: false`, because "the solver gave up" is not "the constraints are
satisfiable". Treating those as the same answer is the failure mode this repository
spends its effort on.
"""
from __future__ import annotations

import json
import sys


def fail(message: str, **extra: object) -> None:
    print(json.dumps({"ok": False, "error": message, **extra}))


# Closed sets: anything outside them is rejected by name.
SORTS = {"int", "real", "bool"}
ARITY = {
    "neg": 1, "not": 1,
    "add": 2, "sub": 2, "mul": 2, "div": 2, "mod": 2,
    "lt": 2, "le": 2, "gt": 2, "ge": 2, "eq": 2, "ne": 2,
    "and": 2, "or": 2, "implies": 2,
}


def build(node, variables, path):
    """Translates one AST node into a Z3 expression. Raises ValueError on bad input."""
    # IntVal/RealVal/BoolVal, NOT Int/Real/Bool: the latter declare a *variable*
    # with that name, so `Int(7)` creates a free constant called "7" that the solver
    # is then free to assign. That produced a `sat` verdict with a model that did
    # not satisfy the constraints — a wrong answer with a confident shape, which is
    # why the test suite checks models against their constraints.
    from z3 import And, BoolVal, If, IntVal, Not, Or, RealVal

    if isinstance(node, dict) and "var" in node:
        name = node["var"]
        if name not in variables:
            raise ValueError(f"{path}: variable {name!r} was not declared")
        return variables[name]

    if isinstance(node, dict) and "lit" in node:
        value = node["lit"]
        if isinstance(value, bool):
            return BoolVal(value)
        if isinstance(value, int):
            return IntVal(value)
        if isinstance(value, float):
            return RealVal(str(value))
        raise ValueError(f"{path}: a literal must be a number or a boolean, got {type(value).__name__}")

    if not isinstance(node, dict) or "op" not in node:
        raise ValueError(f"{path}: expected an object with 'op', 'var' or 'lit'")

    op = node["op"]
    if op == "if":
        args = node.get("args")
        if not isinstance(args, list) or len(args) != 3:
            raise ValueError(f"{path}: 'if' needs exactly 3 args (condition, then, else)")
        return If(build(args[0], variables, f"{path}.args[0]"),
                build(args[1], variables, f"{path}.args[1]"),
                build(args[2], variables, f"{path}.args[2]"))

    if op not in ARITY:
        raise ValueError(f"{path}: unknown operator {op!r}; known operators are {sorted(ARITY)} plus 'if'")

    args = node.get("args")
    if not isinstance(args, list) or len(args) != ARITY[op]:
        raise ValueError(f"{path}: operator {op!r} takes {ARITY[op]} args")

    # Unary operators must be handled before touching args[1]; reading it
    # unconditionally raised IndexError on `not` and `neg`, which surfaced as
    # "list index out of range" — a message about a Python list where the real
    # problem was a missing branch.
    if ARITY[op] == 1:
        operand = build(args[0], variables, f"{path}.args[0]")
        return -operand if op == "neg" else Not(operand)

    left = build(args[0], variables, f"{path}.args[0]")
    right = build(args[1], variables, f"{path}.args[1]")
    if op == "add":
        return left + right
    if op == "sub":
        return left - right
    if op == "mul":
        return left * right
    if op == "div":
        return left / right
    if op == "mod":
        return left % right
    if op == "lt":
        return left < right
    if op == "le":
        return left <= right
    if op == "gt":
        return left > right
    if op == "ge":
        return left >= right
    if op == "eq":
        return left == right
    if op == "ne":
        return left != right
    if op == "and":
        return And(left, right)
    if op == "or":
        return Or(left, right)
    if op == "implies":
        from z3 import Implies
        return Implies(left, right)
    raise ValueError(f"{path}: operator {op!r} is declared but not implemented")


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except Exception as error:  # noqa: BLE001
        fail(f"request is not valid JSON: {error}")
        return 0

    try:
        from z3 import Bool, Int, Real, Solver, set_param
    except Exception as error:  # noqa: BLE001
        fail(f"z3-solver is not importable: {error}")
        return 0

    declared = request.get("variables")
    constraints = request.get("constraints")
    if not isinstance(declared, list) or not declared:
        fail("variables must be a non-empty list")
        return 0
    if not isinstance(constraints, list) or not constraints:
        fail("constraints must be a non-empty list")
        return 0

    timeout_ms = request.get("timeoutMs")
    if isinstance(timeout_ms, int) and timeout_ms > 0:
        set_param("timeout", timeout_ms)

    variables = {}
    try:
        for index, entry in enumerate(declared):
            if not isinstance(entry, dict):
                raise ValueError(f"variables[{index}] must be an object")
            name = entry.get("name")
            sort = entry.get("sort", "int")
            if not isinstance(name, str) or not name:
                raise ValueError(f"variables[{index}] needs a non-empty string name")
            if name in variables:
                raise ValueError(f"variables[{index}]: {name!r} is declared twice")
            if sort not in SORTS:
                raise ValueError(f"variables[{index}]: unknown sort {sort!r}; known sorts are {sorted(SORTS)}")
            if sort == "int":
                variables[name] = Int(name)
            elif sort == "real":
                variables[name] = Real(name)
            else:
                variables[name] = Bool(name)

        solver = Solver()
        for index, constraint in enumerate(constraints):
            solver.add(build(constraint, variables, f"constraints[{index}]"))
    except ValueError as error:
        fail(str(error))
        return 0
    except Exception as error:  # noqa: BLE001 - Z3 raises its own exception type
        fail(f"the constraints could not be translated for Z3: {error}")
        return 0

    verdict = str(solver.check())
    result: dict[str, object] = {"ok": True, "verdict": verdict, "verified": verdict in ("sat", "unsat")}

    if verdict == "sat":
        model = solver.model()
        # Every declared variable is reported, so a caller can tell "this variable
        # was unconstrained" from "the solver did not mention it".
        assignment: dict[str, object] = {}
        for name in variables:
            value = model.evaluate(variables[name], model_completion=True)
            assignment[name] = str(value)
        result["assignment"] = assignment
    elif verdict == "unknown":
        result["reason"] = (
            "Z3 stopped without deciding, usually on a timeout or an undecidable "
            "fragment. This is not a verdict about the constraints."
        )
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
