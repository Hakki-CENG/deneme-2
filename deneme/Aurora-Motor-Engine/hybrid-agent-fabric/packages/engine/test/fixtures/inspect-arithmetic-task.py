"""An Inspect AI task used as a fixture by the eval.inspect.run tests.

Deliberately small and offline: no solver beyond `generate`, no tools, no
network. Two samples with two scorers, so the capability has more than one
metric to report and the per-sample grades are not a single value.

Under `mockllm/model` the model replies with canned text that does not match
the targets, so both scorers report accuracy 0.0. That is the expected result
and the point: a score of zero from a working harness is a successful run, and
a verifier that treated it as a failure would be grading the model while
claiming to check the integration.
"""

from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.scorer import includes, match
from inspect_ai.solver import generate


@task
def arithmetic():
    return Task(
        dataset=[
            Sample(input="What is 2+2? Reply with the number.", target="4"),
            Sample(input="What is the capital of France? Reply with the city.", target="Paris"),
        ],
        solver=[generate()],
        scorer=[match(), includes("Paris")],
    )
