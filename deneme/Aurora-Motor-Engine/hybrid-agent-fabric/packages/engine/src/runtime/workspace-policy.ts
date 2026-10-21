/**
 * Which directories a session may use as its workspace.
 *
 * A session's `workspacePath` decides where every relative file path in that
 * session resolves. Until now a caller could set it to anything: `POST
 * /v1/sessions` accepted `workspacePath` as an unvalidated string and
 * `Supervisor.createSession` passed it straight to `mkdir`. An independent audit
 * confirmed it live — a session was opened on `C:\Windows` and `win.ini` read
 * back through the ordinary file tools.
 *
 * So this is not about a specific attack. It is that the workspace path is a
 * privilege boundary and nothing was enforcing it.
 *
 * Two rules, deliberately different in kind:
 *
 *   1. A short deny list that always applies. No legitimate session workspace is
 *      `/etc`, `C:\Windows` or the filesystem root, so refusing those costs
 *      nothing and holds whatever else is reachable. It compares the directory
 *      itself, not its children: denying `/usr` must not stop someone working in
 *      `/usr/local/src/my-project`.
 *
 *   2. An optional allowlist. When an operator supplies roots, anything outside
 *      them is refused. This is the real control for a deployment that knows
 *      where work is allowed to happen. It is opt-in because Aurora legitimately
 *      runs against directories chosen at session creation — imported sessions,
 *      worktrees, tests — and silently narrowing that would break callers who
 *      were doing nothing wrong.
 */
import { homedir } from "node:os";
import { isAbsolute, resolve, sep } from "node:path";

/**
 * Directories that are never a session workspace, on any platform.
 *
 * Listed for both separators because the check is textual and a Windows path can
 * arrive with either.
 */
const DENIED_POSIX = [
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  "/var",
  "/lib",
  "/lib64",
  "/root",
  "/opt",
  "/srv",
];

const DENIED_WINDOWS = [
  "C:\\",
  "C:\\Windows",
  "C:\\Windows\\System32",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  "C:\\Users",
];

/** Thrown when a session workspace is refused. Carries the reason a caller gets. */
export class WorkspacePathRejectedError extends Error {
  readonly code = "HAF-4031";
  constructor(
    readonly workspacePath: string,
    readonly reason: string,
    /**
     * Server-side detail that must not reach the caller — the operator's
     * configured roots, for instance. Logged, never sent.
     */
    readonly detail?: string,
  ) {
    super(`Workspace path ${JSON.stringify(workspacePath)} was refused: ${reason}`);
    this.name = "WorkspacePathRejectedError";
  }
}

export interface WorkspacePolicyInput {
  /** The path as supplied by the caller, before resolution. */
  readonly workspacePath: string;
  /** Roots the operator has allowed. Absent means no allowlist is in force. */
  readonly allowedRoots?: readonly string[];
  /** The engine's own workspace root. Always allowed. */
  readonly workspaceRoot?: string;
  /** The engine's data root. Its parent is denied; the root itself is fine. */
  readonly dataRoot?: string;
}

export interface WorkspacePolicyResult {
  /** The resolved, normalised path the session should actually use. */
  readonly resolved: string;
  /** Why the path was accepted. Recorded, because a boundary check that cannot
   * explain itself cannot be audited. */
  readonly basis: "default-root" | "allowlist" | "workspace-root" | "not-denied";
}

function normalise(path: string): string {
  // `resolve` collapses `..`, `.` and duplicate separators. A trailing separator
  // is dropped so `/usr/` and `/usr` compare equal, except at a filesystem root.
  const resolved = resolve(path);
  return resolved.length > 1 && resolved.endsWith(sep) ? resolved.slice(0, -1) : resolved;
}

function samePath(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** True when `child` is `parent` or lives under it. */
function isWithin(parent: string, child: string): boolean {
  if (samePath(parent, child)) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return process.platform === "win32"
    ? child.toLowerCase().startsWith(prefix.toLowerCase())
    : child.startsWith(prefix);
}

/** Every directory this policy refuses, resolved for the running platform. */
export function deniedWorkspaceRoots(): readonly string[] {
  const extra: string[] = [];
  const home = normalise(homedir());
  // The home directory itself holds credentials and configuration. Subdirectories
  // of it are ordinary project locations and stay allowed.
  extra.push(home);
  return [...DENIED_POSIX, ...DENIED_WINDOWS, ...extra].map((path) => normalise(path));
}

/**
 * Decide whether a caller-supplied workspace path may be used.
 *
 * Throws `WorkspacePathRejectedError` rather than returning a verdict: a refused
 * workspace must stop session creation, and a boolean here would invite a caller
 * to ignore it.
 */
export function resolveWorkspacePath(input: WorkspacePolicyInput): WorkspacePolicyResult {
  const supplied = input.workspacePath.trim();
  if (supplied.length === 0) {
    throw new WorkspacePathRejectedError(input.workspacePath, "the path is empty");
  }
  if (!isAbsolute(supplied)) {
    // A relative path would resolve against the process working directory, which
    // is wherever the server happened to start. That is not a workspace.
    throw new WorkspacePathRejectedError(
      input.workspacePath,
      "the path must be absolute; a relative path would resolve against the server's working directory",
    );
  }

  const resolved = normalise(supplied);
  const denied = deniedWorkspaceRoots();
  if (denied.some((path) => samePath(path, resolved))) {
    throw new WorkspacePathRejectedError(
      input.workspacePath,
      "a system directory is not a session workspace",
    );
  }

  const allowedRoots = input.allowedRoots?.map((root) => normalise(root)) ?? [];
  if (allowedRoots.length > 0) {
    const extraRoots = [input.workspaceRoot, input.dataRoot]
      .filter((root): root is string => typeof root === "string" && root.length > 0)
      .map((root) => normalise(root));
    const permitted = [...allowedRoots, ...extraRoots];
    if (!permitted.some((root) => isWithin(root, resolved))) {
      // The roots themselves stay out of the message. A caller who can ask for a
      // workspace path can ask repeatedly, and a message listing where the
      // operator allows work would hand them the server's filesystem layout in
      // exchange for a 400.
      throw new WorkspacePathRejectedError(
        input.workspacePath,
        "it is outside the workspace roots this deployment allows",
        `allowed roots: ${permitted.join(", ")}`,
      );
    }
    return { resolved, basis: "allowlist" };
  }

  if (input.workspaceRoot && isWithin(normalise(input.workspaceRoot), resolved)) {
    return { resolved, basis: "workspace-root" };
  }
  return { resolved, basis: "not-denied" };
}
