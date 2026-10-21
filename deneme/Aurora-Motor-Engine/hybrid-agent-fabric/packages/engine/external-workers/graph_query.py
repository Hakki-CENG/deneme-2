"""Query a graph built from an edge list, and check the answer with a plain BFS.

Reads a request from stdin as JSON, writes a result to stdout as JSON.

    {"edgesPath": "/abs/edges.csv", "operation": "shortest_path",
     "from": "Istanbul", "to": "Antalya", "maxHops": 5}

Why this is not Kuzu behind an endpoint.

Every answer is recomputed by a breadth-first search written here over a
dict-of-lists built from the same file with Python's stdlib `csv` module, and
the two are compared. The BFS deliberately does not use Kuzu: two independent
routes to the same answer is evidence, while one library restating its own
output is not.

  reachable       the set Kuzu returns for `*1..maxHops` against the set the BFS
                  finds within the same hop bound
  shortest_path   Kuzu's `SHORTEST` length against the BFS distance
  degrees         Kuzu's `count(r)` per node against a dict tally

The edge list is CSV or TSV with a header naming the source and target columns;
a third column, if present, is carried as a weight but not used for routing,
because these are unweighted hop counts and pretending otherwise would make the
numbers mean something they do not.

Kuzu 0.11.3, MIT (checked against the repository's LICENSE, not only the
package metadata).
"""

from __future__ import annotations

import csv
import json
import os
import sys
from collections import deque

MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_EDGES = 5_000_000
MAX_HOPS_DEFAULT = 4
MAX_HOPS_LIMIT = 8

OPERATIONS = {"reachable", "shortest_path", "degrees"}


def fail(reason: str) -> None:
    print(json.dumps({"error": reason}), flush=True)
    raise SystemExit(1)


def read_edges(path: str) -> tuple[list[tuple[str, str]], list[str]]:
    """The one reading of the file; both routes use it, so they differ in the query, not the data."""
    extension = os.path.splitext(path)[1].lower()
    separator = "\t" if extension == ".tsv" else ","

    edges: list[tuple[str, str]] = []
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.reader(handle, delimiter=separator)
        try:
            header = next(reader)
        except StopIteration:
            fail("the edge file is empty")
        columns = [c.strip() for c in header]
        if len(columns) < 2:
            fail(f"the edge file has {len(columns)} column(s); a source and a target are needed")
        for row in reader:
            if len(row) < 2:
                continue
            source, target = row[0].strip(), row[1].strip()
            if source == "" or target == "":
                continue
            if len(edges) >= MAX_EDGES:
                fail(f"the edge file has more than {MAX_EDGES} edges")
            edges.append((source, target))
    if not edges:
        fail("the edge file has a header but no edges")
    return edges, columns


def bfs_reachable(adjacency: dict[str, list[str]], start: str, max_hops: int) -> dict[str, int]:
    """Plain BFS: node -> hop distance. Written here so it shares no code with Kuzu.

    `start` is deliberately NOT seeded as visited, and the first version of this
    function did seed it and then removed it from the result. Measured against
    Kuzu on an edge list containing a self-loop (X,X): Kuzu reported X as
    reachable from X, this returned only Y, and the check said they disagreed.
    Kuzu was right. A self-loop or any cycle means there really is a path of
    length >= 1 from the start back to itself, and dropping it hides the one
    fact most worth knowing about that graph — that it has a cycle. Seeding
    `start` at distance 0 would be wrong in the other direction, so the walk
    begins at the start's neighbours at hop 1 and `start` only gets a distance
    if a path actually returns to it.
    """
    if start not in adjacency:
        return {}
    distance: dict[str, int] = {}
    queue = deque((neighbour, 1) for neighbour in adjacency.get(start, ()))
    while queue:
        node, depth = queue.popleft()
        if node in distance:
            continue
        distance[node] = depth
        if depth >= max_hops:
            continue
        for neighbour in adjacency.get(node, ()):
            if neighbour not in distance:
                queue.append((neighbour, depth + 1))
    return distance


def main() -> None:
    try:
        request = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as err:
        fail(f"the request is not valid JSON: {err}")

    path = request.get("edgesPath")
    if not isinstance(path, str) or path.strip() == "":
        fail("no edgesPath was given")
    if not os.path.isfile(path):
        fail(f"no such file: {path}")
    try:
        size = os.path.getsize(path)
    except OSError as err:
        fail(f"the file could not be sized: {err}")
    if size > MAX_FILE_BYTES:
        fail(f"the file is {size} bytes, over the {MAX_FILE_BYTES} byte limit")
    if os.path.splitext(path)[1].lower() not in {".csv", ".tsv"}:
        fail("the edge file must be CSV or TSV")

    operation = request.get("operation")
    if operation not in OPERATIONS:
        fail(f"operation {operation!r} is not one of {sorted(OPERATIONS)}")

    max_hops = request.get("maxHops", MAX_HOPS_DEFAULT)
    if not isinstance(max_hops, int) or not 1 <= max_hops <= MAX_HOPS_LIMIT:
        fail(f"maxHops {max_hops!r} must be an integer 1..{MAX_HOPS_LIMIT}")

    edges, columns = read_edges(path)

    start = request.get("from")
    if operation in {"reachable", "shortest_path"}:
        if not isinstance(start, str) or start.strip() == "":
            fail(f"operation {operation} needs a 'from' node")
    target = request.get("to")
    if operation == "shortest_path" and (not isinstance(target, str) or target.strip() == ""):
        fail("operation shortest_path needs a 'to' node")

    # ── The independent structure, built before any query engine is touched ──
    adjacency: dict[str, list[str]] = {}
    out_degree: dict[str, int] = {}
    in_degree: dict[str, int] = {}
    for source, edge_target in edges:
        adjacency.setdefault(source, []).append(edge_target)
        adjacency.setdefault(edge_target, [])
        out_degree[source] = out_degree.get(source, 0) + 1
        in_degree[edge_target] = in_degree.get(edge_target, 0) + 1

    node_count = len(adjacency)
    if operation != "degrees" and start not in adjacency:
        fail(f"no node named {start!r} appears in the edge file")
    if operation == "shortest_path" and target not in adjacency:
        fail(f"no node named {target!r} appears in the edge file")

    try:
        import kuzu
    except ImportError as err:
        fail(f"kuzu is not installed: {err}")

    database = kuzu.Database()
    connection = kuzu.Connection(database)
    try:
        connection.execute("CREATE NODE TABLE Node(name STRING, PRIMARY KEY(name))")
        connection.execute("CREATE REL TABLE Edge(FROM Node TO Node)")
        for name in adjacency:
            connection.execute("CREATE (:Node {name: $n})", {"n": name})
        for source, edge_target in edges:
            connection.execute(
                "MATCH (a:Node {name: $a}), (b:Node {name: $b}) CREATE (a)-[:Edge]->(b)",
                {"a": source, "b": edge_target},
            )

        answer: object
        independent: object

        if operation == "reachable":
            result = connection.execute(
                f"MATCH (a:Node {{name: $start}})-[:Edge*1..{max_hops}]->(b:Node) "
                "RETURN DISTINCT b.name",
                {"start": start},
            )
            answer = sorted({row[0] for row in result})
            independent = sorted(bfs_reachable(adjacency, start, max_hops))

        elif operation == "shortest_path":
            # The parameter names are $fromNode/$toNode rather than
            # $start/$end, and that is not style. Measured: naming a parameter
            # $end raises a Parser exception in Kuzu 0.11.3, because `end` is
            # reserved in the query grammar, and the message points at the
            # query text instead of naming the reserved word — which reads as a
            # malformed query when the query is fine.
            if start == target:
                # Measured, and the reason this branch exists. Kuzu's `SHORTEST`
                # returns no rows when the pattern's start and end bind to the
                # same node — a self-loop X,X queried X->X came back empty,
                # while the plain variable-length pattern found the path of
                # length 1 along with longer walks. So for a same-node question
                # the shortest length is taken by enumeration instead. Bounded
                # by maxHops, which is capped at 8, but it does enumerate paths
                # rather than short-circuiting, and that costs more.
                result = connection.execute(
                    f"MATCH pth=(a:Node {{name: $fromNode}})-[:Edge*1..{max_hops}]->(b:Node {{name: $toNode}}) "
                    "RETURN min(length(pth))",
                    {"fromNode": start, "toNode": target},
                )
            else:
                result = connection.execute(
                    f"MATCH p=(a:Node {{name: $fromNode}})-[:Edge* SHORTEST 1..{max_hops}]->(b:Node {{name: $toNode}}) "
                    "RETURN length(p)",
                    {"fromNode": start, "toNode": target},
                )
            found = [row[0] for row in result if row[0] is not None]
            answer = found[0] if found else None
            distances = bfs_reachable(adjacency, start, max_hops)
            independent = distances.get(target)

        else:
            result = connection.execute(
                "MATCH (a:Node)-[r:Edge]->() RETURN a.name, count(r) ORDER BY a.name",
            )
            answer = {row[0]: int(row[1]) for row in result}
            independent = {name: count for name, count in sorted(out_degree.items()) if count > 0}

    except Exception as err:  # kuzu raises its own exception types
        fail(f"the graph query failed: {type(err).__name__}: {err}")

    agrees = answer == independent
    print(
        json.dumps(
            {
                "operation": operation,
                "answer": answer,
                "check": {
                    "agrees": agrees,
                    "engine": answer,
                    "independent": independent,
                },
                "graph": {
                    "nodeCount": node_count,
                    "edgeCount": len(edges),
                    "columns": columns,
                    "maxHops": max_hops,
                },
                "verified": agrees,
                # Stated rather than implied: a weight column is read but not
                # routed on, so these are hop counts and not distances.
                "weightNote": (
                    "a third column is read as a weight but is not used for routing; "
                    "these are unweighted hop counts"
                    if len(columns) > 2
                    else "the edge file has no weight column"
                ),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
