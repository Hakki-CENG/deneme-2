#!/usr/bin/env python3
"""
Symbolic mathematics worker — the external half of Aurora's `math.symbolic`.

Backed by SymPy, BSD-3-Clause (verified against the repository's LICENSE file,
because the survey's automated licence detection reported "not identifiable").

Aurora had no symbolic mathematics at all, so this fills a socket rather than
overlapping an existing capability.

Why this capability matters more than its size suggests: it is the first one
where the verifier can check CORRECTNESS rather than merely shape. A solution
to an equation can be substituted back into the equation. A derivative can be
compared against a numerical difference quotient. A web page cannot be checked
that way; an equation can.

Protocol
    stdin : {"operation": "...", "expression": "...", "variable": "...",
             "point": n, "precision": n}
    stdout: {"operation": "...", "input": "...", "result": "...",
             "check": {...}}

Parsing, and the part that needs care:

  SymPy's `sympify` evaluates its argument with Python's `eval` against a
  namespace, which is how a string that looks like an expression can end up
  running code. So this worker does not call `sympify` on caller input. It uses
  `parse_expr` with an explicit, closed `global_dict` containing only the SymPy
  names this worker needs, and an empty `local_dict`. `__builtins__` is set to
  an empty mapping so `import`, `open`, `eval` and friends are not reachable by
  name.

  That is a real restriction, not a claim of total safety: the process is also
  run through Aurora's subprocess adapter, which gives it no inherited
  environment and a wall-clock limit. Defence here is layered rather than
  resting on the parser alone, and this docstring says which layer does what
  instead of implying the parser is sufficient by itself.
"""

import json
import sys

OPERATIONS = ("simplify", "solve", "diff", "integrate", "factor", "expand", "evalf", "limit")


def fail(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()
    sys.exit(1)


def build_namespace():
    import sympy

    # A closed namespace. Anything not listed here is not a name the caller can
    # reach, and __builtins__ is emptied so eval cannot find import/open/exec.
    allowed = {
        "Symbol", "symbols", "Integer", "Rational", "Float", "pi", "E", "I", "oo",
        "sin", "cos", "tan", "exp", "log", "sqrt", "Abs", "factorial", "gamma",
        "Matrix", "Eq", "Ne", "Lt", "Le", "Gt", "Ge", "And", "Or", "Not",
        "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh",
        "Sum", "Product", "Integral", "Derivative", "Limit", "Piecewise",
        "Min", "Max", "floor", "ceiling", "sign", "conjugate", "re", "im",
    }
    global_dict = {name: getattr(sympy, name) for name in allowed if hasattr(sympy, name)}
    global_dict["__builtins__"] = {}
    return sympy, global_dict


def main() -> None:
    try:
        request = json.load(sys.stdin)
    except Exception as err:
        fail(f"invalid JSON request: {err}")
        return

    operation = request.get("operation")
    if operation not in OPERATIONS:
        fail(f"operation must be one of {', '.join(OPERATIONS)}")
        return

    expression = request.get("expression")
    if not isinstance(expression, str) or not expression.strip():
        fail("request.expression must be a non-empty string")
        return
    if len(expression) > 4000:
        fail("request.expression is longer than 4000 characters")
        return

    try:
        sympy, global_dict = build_namespace()
        from sympy.parsing.sympy_parser import parse_expr
    except ImportError as err:
        fail(f"sympy is not installed in this interpreter: {err}")
        return

    try:
        expr = parse_expr(expression, global_dict=global_dict, local_dict={}, evaluate=True)
    except Exception as err:
        fail(f"could not parse the expression: {type(err).__name__}: {str(err)[:200]}")
        return

    variable_name = request.get("variable")
    symbol = None
    if isinstance(variable_name, str) and variable_name.strip():
        symbol = sympy.Symbol(variable_name.strip())

    precision = request.get("precision", 15)
    if not isinstance(precision, int) or precision < 1 or precision > 50:
        fail("request.precision must be an integer between 1 and 50")
        return

    try:
        if operation == "simplify":
            result = sympy.simplify(expr)
        elif operation == "factor":
            result = sympy.factor(expr)
        elif operation == "expand":
            result = sympy.expand(expr)
        elif operation == "evalf":
            result = sympy.N(expr, precision)
        elif operation == "diff":
            if symbol is None:
                free = sorted(expr.free_symbols, key=lambda s: s.name)
                if not free:
                    fail("differentiation needs a variable and the expression has none")
                    return
                symbol = free[0]
            result = sympy.diff(expr, symbol)
        elif operation == "integrate":
            if symbol is None:
                free = sorted(expr.free_symbols, key=lambda s: s.name)
                if not free:
                    fail("integration needs a variable and the expression has none")
                    return
                symbol = free[0]
            result = sympy.integrate(expr, symbol)
        elif operation == "solve":
            result = sympy.solve(expr, symbol) if symbol is not None else sympy.solve(expr)
        elif operation == "limit":
            point = request.get("point", 0)
            if symbol is None:
                fail("a limit needs a variable")
                return
            result = sympy.limit(expr, symbol, point)
        else:
            fail(f"unsupported operation: {operation}")
            return
    except Exception as err:
        fail(f"{operation} failed: {type(err).__name__}: {str(err)[:200]}")
        return

    check = {}

    # Independent checks. These are the point of the capability: an answer that
    # can be substituted back and verified is worth more than one that merely
    # parsed. A failure here is reported, never hidden.
    try:
        if operation == "solve" and isinstance(result, (list, tuple)) and len(result) > 0:
            residuals = []
            free = sorted(expr.free_symbols, key=lambda s: s.name)
            target = symbol if symbol is not None else (free[0] if free else None)
            if target is not None:
                for solution in result[:5]:
                    try:
                        residual = sympy.simplify(expr.subs(target, solution))
                        residuals.append(str(sympy.N(residual, 8)))
                    except Exception as exc:
                        residuals.append(f"unchecked: {exc}")
                check = {"substituted_residuals": residuals}
        elif operation == "diff" and symbol is not None:
            # Compare the symbolic derivative against a central difference
            # quotient at a point, which is an independent way to be wrong.
            free = sorted(expr.free_symbols, key=lambda s: s.name)
            if len(free) == 1:
                point = sympy.Rational(7, 10)
                h = sympy.Rational(1, 1000000)
                numeric = (expr.subs(symbol, point + h) - expr.subs(symbol, point - h)) / (2 * h)
                symbolic = result.subs(symbol, point)
                try:
                    delta = abs(sympy.N(numeric, 10) - sympy.N(symbolic, 10))
                    check = {"numeric_vs_symbolic_delta": str(sympy.N(delta, 6))}
                except Exception as exc:
                    check = {"numeric_vs_symbolic_delta": f"unchecked: {exc}"}
    except Exception as exc:
        check = {"error": str(exc)[:200]}

    payload = {
        "operation": operation,
        "input": expression,
        "result": str(result),
        "variable": str(symbol) if symbol is not None else None,
        "check": check,
    }
    try:
        json.dump(payload, sys.stdout, default=str)
    except Exception as err:
        fail(f"could not serialise the result: {err}")
        return
    sys.stdout.write("\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
