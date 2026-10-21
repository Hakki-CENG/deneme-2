/**
 * Sandbox Worker Entry — Aurora Cognitive Runtime
 *
 * Runs untrusted generated-capability code inside a dedicated worker thread.
 * The worker is spawned with `eval: true` from `SandboxExecutor`, so this file
 * documents and implements the contract that the worker body follows.
 *
 * Isolation properties:
 * - separate V8 isolate (own heap, own globals)
 * - `resourceLimits` enforce max heap / stack; OOM terminates the worker only
 * - no `workerData` inheritance of parent scope
 * - parent applies a wall-clock timeout and calls `terminate()`
 * - `node:vm` context strips `process`, `require` and dynamic `import`
 */

/**
 * Message sent from the host into the sandbox worker.
 */
export interface SandboxWorkerRequest {
  /** Source code of the capability to execute. */
  readonly code: string;
  /** JSON-serialisable input handed to the capability. */
  readonly input: unknown;
  /** Wall-clock budget enforced inside the worker via vm timeout. */
  readonly timeoutMs: number;
}

/**
 * Message emitted by the sandbox worker back to the host.
 */
export interface SandboxWorkerResponse {
  readonly ok: boolean;
  readonly output?: unknown;
  readonly error?: string;
  /** Console output captured during execution (bounded). */
  readonly logs: readonly string[];
}

/**
 * Worker body executed inside the isolate.
 *
 * Exposed as a string because `new Worker(source, { eval: true })` needs the
 * script text; keeping it here (rather than inline in the executor) keeps the
 * sandbox contract reviewable in one place.
 */
export const SANDBOX_WORKER_SOURCE = /* js */ `
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

const logs = [];
const MAX_LOGS = 100;
const MAX_LOG_LEN = 2000;

function capture(level) {
  return (...args) => {
    if (logs.length >= MAX_LOGS) return;
    const line = args
      .map((a) => {
        if (typeof a === "string") return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(" ");
    logs.push(level + ": " + line.slice(0, MAX_LOG_LEN));
  };
}

async function run() {
  const { code, input, timeoutMs } = workerData;

  // SECURITY — the context is created EMPTY, on purpose.
  //
  // Every intrinsic that exists inside a vm context belongs to that context's
  // own realm, so JSON.constructor.constructor in there is the CONTEXT's
  // Function constructor, which codeGeneration.strings:false refuses. The
  // moment a host object crosses the boundary that stops being true: a host
  // function's .constructor is the HOST realm's Function, which is governed
  // by the host's rules, not this context's. Calling it evaluates arbitrary
  // code in the host realm, where process exists.
  //
  // This file used to hand in JSON, Math, Date, String, Array, Object,
  // Promise, Error, a console built from host closures and structuredClone.
  // Each one of those was a door. Measured through the real
  // SandboxExecutor path, returning JSON.constructor.constructor('return
  // process')() handed back the host process object, and process.binding('fs')
  // gave raw filesystem syscalls. See
  // test/sandbox-escape.test.ts, which asserts the denial.
  const sandbox = {};
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  // Data crosses as a JSON literal rather than as a host object, and log lines
  // accumulate in a context-local array that the host reads after the run.
  // Neither direction needs a host callable, so nothing is exposed to
  // untrusted code that could be walked back to the host realm.
  const inputLiteral = JSON.stringify(JSON.stringify(input ?? null));
  // Built as a single line on purpose. This file is one template literal, so an
  // escaped newline written here arrives in the worker source as a REAL newline
  // inside a double-quoted string, which is a syntax error. Statements are
  // separated by semicolons instead, so no newline escape is needed at all.
  const prelude =
    "var __logs = [];" +
    "var __cap = function (level) { return function () {" +
    "  if (__logs.length >= " + MAX_LOGS + ") return;" +
    "  var parts = [];" +
    "  for (var i = 0; i < arguments.length; i++) {" +
    "    var a = arguments[i];" +
    "    if (typeof a === 'string') { parts.push(a); }" +
    "    else { try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); } }" +
    "  }" +
    "  __logs.push(level + ': ' + parts.join(' ').slice(0, " + MAX_LOG_LEN + "));" +
    "}; };" +
    "var console = { log: __cap('log'), warn: __cap('warn'), error: __cap('error')," +
    "  info: __cap('info'), debug: __cap('debug') };" +
    "var input = JSON.parse(" + inputLiteral + ");";

  new vm.Script(prelude, { filename: "sandbox-prelude.js" }).runInContext(context, {
    timeout: timeoutMs,
  });

  // The capability body is wrapped in an async IIFE so both sync returns and
  // awaited promises resolve through the same path.
  const wrapped =
    "(async () => {\\n" + code + "\\n})()";

  const script = new vm.Script(wrapped, { filename: "capability.js" });
  const result = await script.runInContext(context, { timeout: timeoutMs });

  // Logs are read back out of the context realm. They are plain strings, so
  // reading them hands the host no reference it did not already have.
  const captured = sandbox.__logs;
  return { output: result, logs: Array.isArray(captured) ? captured.slice(0, MAX_LOGS) : [] };
}

run()
  .then(({ output, logs: runLogs }) => {
    let safe;
    try {
      // Force a structured-clone-safe payload across the thread boundary.
      safe = JSON.parse(JSON.stringify(output === undefined ? null : output));
    } catch {
      safe = String(output);
    }
    parentPort.postMessage({ ok: true, output: safe, logs: runLogs });
  })
  .catch((err) => {
    parentPort.postMessage({
      ok: false,
      error: err && err.message ? String(err.message) : String(err),
      logs,
    });
  });
`;
