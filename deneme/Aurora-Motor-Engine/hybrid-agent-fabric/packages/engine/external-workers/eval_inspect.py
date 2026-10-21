"""Run an Inspect AI task and return its scored result. Inspect AI 0.3.281, MIT.

Reads a request from stdin as JSON, writes a result to stdout as JSON.

    {"taskFile": "/abs/path/task.py", "model": "mockllm/model", "limit": 10}

WHAT THIS ACTUALLY DOES, stated plainly because it matters:

Running an Inspect task imports and executes the Python in that file. There is
no way to evaluate a task without running the code that defines it — that is
how the framework works, not a shortcut taken here. The containment is
therefore the process, not the parser: this runs under the subprocess adapter
with no shell, a wall-clock limit, and an environment reduced to PATH and
LANG.

That last restriction has a consequence worth stating rather than hiding. With
no API keys in the environment, a task aimed at a hosted model cannot reach
one. In practice this capability runs offline tasks under `mockllm/model`, and
a score produced that way measures whether the HARNESS works. It does not
measure whether Aurora is good at anything, and the manifest says so.

Result shape was measured against Inspect AI 0.3.281 rather than assumed:
`EvalConfig` has no `model` attribute (that lives on `log.eval`), per-sample
scores are grade strings like "I"/"C" rather than numbers, and `eval()`
returns an `EvalLogs` sequence, not a single log.
"""

from __future__ import annotations

import json
import os
import re
import sys

MAX_SAMPLES_REPORTED = 50

# A model name Inspect will accept: provider/model, plus the reserved offline
# mock provider. Checked here so nothing odd reaches the framework.
MODEL_NAME = re.compile(r"^[A-Za-z0-9_.:/-]{1,128}$")


def fail(reason: str) -> None:
    print(json.dumps({"error": reason}), flush=True)
    raise SystemExit(1)


def grade_value(value: object) -> object:
    """Inspect grades carry `.value`; metrics carry `.value` too. Flatten both."""
    inner = getattr(value, "value", value)
    if isinstance(inner, (str, int, float, bool)) or inner is None:
        return inner
    return str(inner)


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        fail(f"the request is not valid JSON: {err}")

    task_file = request.get("taskFile")
    if not isinstance(task_file, str) or task_file.strip() == "":
        fail("no taskFile was given")
    if not os.path.isfile(task_file):
        fail(f"no such task file: {task_file}")

    model = request.get("model", "mockllm/model")
    if not isinstance(model, str) or not MODEL_NAME.match(model):
        fail(f"the model name {model!r} is not a valid Inspect model reference")

    limit = request.get("limit")
    if limit is not None and (not isinstance(limit, int) or not 1 <= limit <= 1000):
        fail(f"limit {limit!r} must be an integer 1..1000")

    log_dir = request.get("logDir")
    if not isinstance(log_dir, str) or log_dir.strip() == "":
        fail("no logDir was given")

    # Imported here, after the arguments are checked, so a bad request does not
    # pay the import cost.
    try:
        from inspect_ai import eval as inspect_eval
    except ImportError as err:
        fail(f"inspect_ai is not installed: {err}")

    kwargs: dict[str, object] = {
        "model": model,
        "log_dir": log_dir,
        "display": "none",
    }
    if limit is not None:
        kwargs["limit"] = limit

    # Measured: Inspect resolves task files with Path.glob, which raises
    # "Non-relative patterns are unsupported" for an absolute path. So the
    # working directory moves to the task file's own directory and the bare
    # filename is passed. That also lets a task file import its own helpers by
    # relative name, which is how real task files are written.
    task_dir = os.path.dirname(os.path.abspath(task_file))
    task_name = os.path.basename(task_file)
    os.chdir(task_dir)

    try:
        logs = inspect_eval(task_name, **kwargs)
    except Exception as err:  # Inspect raises many types; the caller needs one shape.
        fail(f"the task could not be run: {type(err).__name__}: {err}")

    # `eval()` returns an EvalLogs sequence. An empty one means no @task was
    # found in the file, which is a real outcome and not an exception.
    try:
        log = logs[0]
    except (IndexError, TypeError):
        fail(f"no task was found in {task_name}")

    scores = []
    if log.results is not None:
        for score in log.results.scores:
            scores.append(
                {
                    "scorer": score.scorer,
                    "metrics": {name: grade_value(m) for name, m in score.metrics.items()},
                }
            )

    samples = []
    for sample in (log.samples or [])[:MAX_SAMPLES_REPORTED]:
        sample_scores = {}
        for name, grade in (sample.scores or {}).items():
            sample_scores[name] = grade_value(grade)
        samples.append({"id": str(sample.id), "scores": sample_scores})

    usage = {}
    stats = getattr(log, "stats", None)
    for name, model_usage in (getattr(stats, "model_usage", None) or {}).items():
        usage[name] = {
            "inputTokens": getattr(model_usage, "input_tokens", None),
            "outputTokens": getattr(model_usage, "output_tokens", None),
            "totalTokens": getattr(model_usage, "total_tokens", None),
        }

    error = getattr(log, "error", None)

    print(
        json.dumps(
            {
                "status": log.status,
                "task": getattr(log.eval, "task", None),
                "model": getattr(log.eval, "model", None),
                "sampleCount": len(log.samples or []),
                "sampleLimitReported": len(log.samples or []) > MAX_SAMPLES_REPORTED,
                "scores": scores,
                "samples": samples,
                "modelUsage": usage,
                # A log can be status=error while still carrying partial scores.
                "error": (getattr(error, "message", None) or str(error)) if error else None,
                "logLocation": getattr(log, "location", None),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
