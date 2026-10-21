"""Profile a tabular dataset, and check the profile against a second reading.

Reads a request from stdin as JSON, writes a result to stdout as JSON.

    {"path": "/abs/data.csv", "sampleValues": 3}

Why this is not just `polars.describe()` in a box.

Every number in the profile is recomputed a second time from the raw file using
Python's stdlib `csv` module, and the two are compared. The recomputation
deliberately does not use polars: two readings of the same file by different
code paths agreeing is evidence, whereas one library restating its own output
is not. The checks are:

  row_count        stdlib line count (minus the header) against polars' height
  column_count     header length against polars' width
  null_counts      per column, counted from raw cells against polars' count
  numeric_mean     for the first numeric column, summed and divided from the
                   raw cells and compared to polars' mean
  invariants       min <= p25 <= p50 <= p75 <= max, and std >= 0

A profile whose numbers cannot be re-derived is reported as unchecked rather
than being handed back as if it had been established.

One behaviour is reported rather than hidden, because it was measured: an empty
CSV cell is read as a missing value, and neither `null_values=[]` nor
`schema_overrides` changes that. So `nullCount` counts empty cells as missing
and this tool cannot distinguish an empty string from an absent one in CSV.

Polars 2.0.0, MIT.
"""

from __future__ import annotations

import csv
import json
import math
import os
import sys

MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_ROWS_RAW_RECHECK = 2_000_000
MEAN_TOLERANCE = 1e-6


def fail(reason: str) -> None:
    print(json.dumps({"error": reason}), flush=True)
    raise SystemExit(1)


def to_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return None if math.isnan(number) else number


def raw_recheck(path: str, columns: list[str], numeric: set[str]) -> dict[str, object]:
    """A second, independent reading of the file using only the stdlib."""
    row_count = 0
    null_counts = {name: 0 for name in columns}
    numeric_sums: dict[str, float] = {}
    numeric_counts: dict[str, int] = {}

    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return {"columnCount": 0, "rowCount": 0, "nullCounts": {}, "numericMeans": {}}

        for row in reader:
            if not row:
                continue
            row_count += 1
            for index, name in enumerate(header):
                cell = row[index] if index < len(row) else ""
                # An empty cell is what polars treats as missing; this reading
                # applies the same rule so the two are comparable.
                if cell.strip() == "":
                    if name in null_counts:
                        null_counts[name] += 1
                    continue
                # Only columns polars typed as numeric are summed here; the
                # point of this function is to re-derive THEIR numbers by a
                # different route, not to re-decide the schema.
                if name not in numeric:
                    continue
                try:
                    value = float(cell)
                except ValueError:
                    continue
                numeric_sums[name] = numeric_sums.get(name, 0.0) + value
                numeric_counts[name] = numeric_counts.get(name, 0) + 1

    means = {
        name: numeric_sums[name] / numeric_counts[name]
        for name in numeric_sums
        if numeric_counts.get(name, 0) > 0
    }
    return {
        "columnCount": len(header),
        "rowCount": row_count,
        "nullCounts": null_counts,
        "numericMeans": means,
    }


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        fail(f"the request is not valid JSON: {err}")

    path = request.get("path")
    if not isinstance(path, str) or path.strip() == "":
        fail("no path was given")
    if not os.path.isfile(path):
        fail(f"no such file: {path}")

    try:
        size = os.path.getsize(path)
    except OSError as err:
        fail(f"the file could not be sized: {err}")
    if size == 0:
        fail("the file is empty")
    if size > MAX_FILE_BYTES:
        fail(f"the file is {size} bytes, over the {MAX_FILE_BYTES} byte limit")

    extension = os.path.splitext(path)[1].lower()
    if extension not in {".csv", ".tsv"}:
        fail(f"{extension or 'this file'} is not a CSV or TSV file")

    try:
        import polars as pl
    except ImportError as err:
        fail(f"polars is not installed: {err}")

    separator = "\t" if extension == ".tsv" else ","
    try:
        frame = pl.read_csv(path, separator=separator, infer_schema_length=1000)
    except Exception as err:  # polars raises several types for malformed input
        fail(f"the file could not be parsed as {extension}: {type(err).__name__}: {err}")

    if frame.height == 0:
        fail("the file has a header but no data rows")

    sample_values = request.get("sampleValues", 3)
    if not isinstance(sample_values, int) or not 0 <= sample_values <= 20:
        fail(f"sampleValues {sample_values!r} must be an integer 0..20")

    columns: list[dict[str, object]] = []
    numeric_columns: list[str] = []

    for name in frame.columns:
        series = frame[name]
        dtype = str(series.dtype)
        null_count = int(series.null_count())
        non_null = frame.height - null_count

        entry: dict[str, object] = {
            "name": name,
            "dtype": dtype,
            "nullCount": null_count,
            "nonNullCount": non_null,
            "distinctCount": int(series.n_unique()),
        }

        numeric = series.dtype.is_numeric() and series.dtype != pl.Boolean
        if numeric:
            numeric_columns.append(name)
            entry["mean"] = to_number(series.mean())
            entry["std"] = to_number(series.std())
            entry["min"] = to_number(series.min())
            entry["max"] = to_number(series.max())
            for label, q in (("p25", 0.25), ("p50", 0.5), ("p75", 0.75)):
                entry[label] = to_number(series.quantile(q))
        else:
            # Most frequent values, which is what a categorical summary is for.
            if non_null > 0 and sample_values > 0:
                counts = (
                    series.drop_nulls()
                    .value_counts()
                    .sort("count", descending=True)
                    .head(sample_values)
                )
                entry["topValues"] = [
                    {"value": str(row[0]), "count": int(row[1])}
                    for row in counts.iter_rows()
                ]

        columns.append(entry)

    profile = {
        "rowCount": frame.height,
        "columnCount": frame.width,
        "byteCount": size,
        "columns": columns,
    }

    # ── The independent re-derivation ──
    checks: dict[str, object] = {}
    if frame.height <= MAX_ROWS_RAW_RECHECK:
        raw = raw_recheck(path, frame.columns, set(numeric_columns))

        checks["rowCount"] = {
            "profile": frame.height,
            "independent": raw["rowCount"],
            "agrees": frame.height == raw["rowCount"],
        }
        checks["columnCount"] = {
            "profile": frame.width,
            "independent": raw["columnCount"],
            "agrees": frame.width == raw["columnCount"],
        }

        null_mismatches = [
            {
                "column": name,
                "profile": next(
                    (c["nullCount"] for c in columns if c["name"] == name), None
                ),
                "independent": count,
            }
            for name, count in raw["nullCounts"].items()
            if next((c["nullCount"] for c in columns if c["name"] == name), None) != count
        ]
        checks["nullCounts"] = {
            "agrees": len(null_mismatches) == 0,
            "mismatches": null_mismatches[:10],
        }

        if numeric_columns:
            probe = numeric_columns[0]
            profile_mean = next(
                (c["mean"] for c in columns if c["name"] == probe), None
            )
            independent_mean = raw["numericMeans"].get(probe)
            both_present = (
                isinstance(profile_mean, float) and isinstance(independent_mean, float)
            )
            checks["numericMean"] = {
                "column": probe,
                "profile": profile_mean,
                "independent": independent_mean,
                "agrees": bool(
                    both_present and abs(profile_mean - independent_mean) <= MEAN_TOLERANCE
                ),
            }
        else:
            checks["numericMean"] = {
                "agrees": True,
                "note": "no numeric column, so nothing to re-derive",
            }
    else:
        checks["recheckSkipped"] = {
            "reason": f"the file has more than {MAX_ROWS_RAW_RECHECK} rows, so the "
            "independent re-derivation was skipped rather than approximated"
        }

    invariant_violations: list[str] = []
    for entry in columns:
        if "min" not in entry:
            continue
        name = str(entry["name"])
        ordered = [entry.get("min"), entry.get("p25"), entry.get("p50"), entry.get("p75"), entry.get("max")]
        present = [v for v in ordered if isinstance(v, float)]
        if any(b < a for a, b in zip(present, present[1:])):
            invariant_violations.append(f"{name}: quantiles are not monotonic")
        std = entry.get("std")
        if isinstance(std, float) and std < 0:
            invariant_violations.append(f"{name}: std is negative")
    checks["invariants"] = {
        "agrees": len(invariant_violations) == 0,
        "violations": invariant_violations[:10],
    }

    evaluated = [c for c in checks.values() if isinstance(c, dict) and "agrees" in c]
    verified = len(evaluated) > 0 and all(bool(c["agrees"]) for c in evaluated)

    print(
        json.dumps(
            {
                "profile": profile,
                "checks": checks,
                "verified": verified,
                "checkCount": len(evaluated),
                # Reported rather than hidden: empty cells are counted as
                # missing and cannot be distinguished from absent ones in CSV.
                "missingValueNote": (
                    "empty cells are counted as missing; polars reads an empty CSV cell as "
                    "null and neither null_values nor schema_overrides changes that, so an "
                    "empty string cannot be distinguished from an absent value here"
                ),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
