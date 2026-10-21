#!/usr/bin/env python3
"""
DuckDB query worker — the external half of Aurora's data-analysis capability.

Runs as a subprocess spawned by `capabilities/external/subprocess-adapter.ts`.
It is deliberately small and boring: read a JSON request on stdin, run one
query, print one JSON document on stdout, exit non-zero on error.

Protocol
    stdin : {"sql": "...", "database": "/abs/path.db" | ":memory:", "limit": n}
    stdout: {"columns": [...], "rows": [[...]], "rowCount": n, "truncated": bool}

Design decisions that matter to Aurora:

  * **One statement only.** `duckdb.execute` is given a single string and the
    request is rejected if it contains a second statement, because a capability
    that accepts a script accepts arbitrary writes. Reads are the contract.

  * **Read-only for anything persistent.** A real file is opened with
    `read_only=True` unless the caller explicitly asks for a write, which is
    where the manifest's `filesystemPolicy` is actually enforced rather than
    merely stated. An in-memory database is opened read-write because DuckDB
    refuses to open one read-only and it has no persistent state to protect;
    writes there vanish with the process.

  * **Row limit enforced here, not by the caller.** A query returning ten
    million rows would exhaust the adapter's stdout cap and Aurora's heap.
    Truncation is reported as a flag, never silently.

  * **Errors go to stderr with a non-zero exit.** The adapter maps that to
    `failed`. Nothing here ever claims the result is correct — that is a
    verifier's job, and this worker has no opinion about it.
"""

import json
import sys


def fail(message: str) -> "NoReturn":  # type: ignore[name-defined]
    sys.stderr.write(message + "\n")
    sys.stderr.flush()
    sys.exit(1)


def main() -> None:
    try:
        request = json.load(sys.stdin)
    except Exception as err:  # malformed stdin is a caller bug
        fail(f"invalid JSON request: {err}")
        return

    sql = request.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        fail("request.sql must be a non-empty string")
        return

    # One statement only. Splitting on ';' is a blunt instrument, but the point
    # is to refuse a script rather than to parse SQL — a second statement means
    # the caller sent more than a query.
    if ";" in sql.strip().rstrip(";"):
        fail("only a single statement is accepted; a second statement was found")
        return

    database = request.get("database", ":memory:")
    if not isinstance(database, str) or not database:
        fail("request.database must be a non-empty string or ':memory:'")
        return

    limit = request.get("limit", 1000)
    if not isinstance(limit, int) or limit < 1 or limit > 100_000:
        fail("request.limit must be an integer between 1 and 100000")
        return

    write = bool(request.get("write", False))

    try:
        import duckdb
    except ImportError as err:
        fail(f"duckdb is not installed in this interpreter: {err}")
        return

    # Read-only protects persistent data. An in-memory database has nothing to
    # protect and DuckDB refuses to open one read-only, so the flag is applied
    # only where it means something: a real file on disk.
    in_memory = database == ":memory:"
    try:
        connection = duckdb.connect(
            database=database,
            read_only=(not write) and (not in_memory),
        )
    except Exception as err:
        fail(f"could not open database '{database}': {err}")
        return

    try:
        # Fetch one row beyond the limit so truncation can be reported as a
        # fact rather than inferred from the caller's limit being reached.
        cursor = connection.execute(sql)
        # DB-API descriptions are 7-tuples (name, type, display_size, ...), so
        # the column name is the first element rather than a pair to unpack.
        columns = [row[0] for row in (cursor.description or [])]
        rows = cursor.fetchmany(limit + 1)
    except Exception as err:
        fail(f"query failed: {err}")
        return
    finally:
        try:
            connection.close()
        except Exception:
            pass

    truncated = len(rows) > limit
    payload = {
        "columns": columns,
        "rows": rows[:limit],
        "rowCount": min(len(rows), limit),
        "truncated": truncated,
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
