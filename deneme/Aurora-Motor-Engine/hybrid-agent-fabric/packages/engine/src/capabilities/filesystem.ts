import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { atomicWrite, atomicWriteBuffer } from "../util/atomic-file.js";
import type { WorkspaceQuota } from "../util/workspace-quota.js";
import { parseSafeTar } from "../util/safe-tar.js";
import { defineCapability } from "./schema.js";

async function confinedPath(workspacePath: string, requestedPath: string, forWrite = false): Promise<string> {
  const root = await realpath(workspacePath);
  const candidate = resolve(root, requestedPath);
  const lexicalRelative = relative(root, candidate);
  if (lexicalRelative.startsWith(`..${sep}`) || lexicalRelative === ".." || lexicalRelative.startsWith(sep)) {
    throw new Error("Path escapes the assigned workspace.");
  }
  if (!forWrite) {
    const actual = await realpath(candidate);
    const actualRelative = relative(root, actual);
    if (actualRelative.startsWith(`..${sep}`) || actualRelative === "..") throw new Error("Symlink escapes the workspace.");
    return actual;
  }
  let parent = dirname(candidate);
  while (parent !== root) {
    try {
      const actualParent = await realpath(parent);
      const parentRelative = relative(root, actualParent);
      if (parentRelative.startsWith(`..${sep}`) || parentRelative === "..") throw new Error("Write path follows a symlink outside workspace.");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      parent = dirname(parent);
    }
  }
  return candidate;
}


const SEARCH_SKIP_DIRECTORIES = new Set([".git", "node_modules", ".venv", "dist", "build", "target", ".next", "__pycache__", "coverage", ".turbo", ".cache"]);
const MAX_SEARCH_FILES = 20_000;
const MAX_SEARCHED_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Translate a glob into an anchored regular expression.
 *
 * `**` crosses directory separators, `*` does not, `?` is one non-separator character and
 * `{a,b}` is an alternation. Everything else is escaped, so a pattern is a pattern and never an
 * accidental regex injection from a caller who typed a `(`.
 */
function globToRegExp(pattern: string): RegExp {
  let output = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index++;
        if (pattern[index + 1] === "/") index++;
        output += "(?:.*/)?";
      } else {
        output += "[^/]*";
      }
    } else if (char === "?") output += "[^/]";
    else if (char === "{") output += "(?:";
    else if (char === "}") output += ")";
    else if (char === "," ) output += "|";
    else output += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${output}$`);
}

async function* walkFiles(root: string, base: string): AsyncGenerator<{ absolute: string; relative: string }> {
  const stack: string[] = [base];
  let visited = 0;
  while (stack.length > 0) {
    const directory = stack.pop()!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (visited >= MAX_SEARCH_FILES) return;
      if (entry.name.startsWith(".") && SEARCH_SKIP_DIRECTORIES.has(entry.name)) continue;
      if (SEARCH_SKIP_DIRECTORIES.has(entry.name)) continue;
      const full = resolve(directory, entry.name);
      // Symlinks are listed by `filesystem.list` but never followed by a search: a link into /etc
      // would otherwise turn a workspace grep into a host-wide one.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        visited++;
        yield { absolute: full, relative: relative(root, full) };
      }
    }
  }
}

function looksBinary(sample: Buffer): boolean {
  const limit = Math.min(sample.length, 4096);
  for (let index = 0; index < limit; index++) if (sample[index] === 0) return true;
  return false;
}

interface PatchHunk { path: string; oldStart: number; oldLines: string[]; newLines: string[] }

/**
 * Parse a unified diff into per-file hunks.
 *
 * Only what a coding agent actually needs is accepted: `---`/`+++` headers, `@@` hunk headers, and
 * context/add/remove lines. Anything else is refused rather than guessed at, because a patch applied
 * from a half-understood diff is a silent corruption, not an error.
 */
function parseUnifiedDiff(diff: string): Map<string, PatchHunk[]> {
  const files = new Map<string, PatchHunk[]>();
  const lines = diff.split(/\r?\n/);
  let path: string | undefined;
  let hunk: PatchHunk | undefined;
  const flush = () => {
    if (!hunk || !path) return;
    const list = files.get(path) ?? [];
    list.push(hunk);
    files.set(path, list);
    hunk = undefined;
  };
  for (const line of lines) {
    if (line.startsWith("--- ")) { flush(); continue; }
    if (line.startsWith("+++ ")) {
      flush();
      const raw = line.slice(4).trim().split("\t")[0]!;
      path = raw.replace(/^[ab]\//, "");
      if (path === "/dev/null") throw new Error("Deleting files through a patch is not supported; use an explicit removal.");
      continue;
    }
    if (line.startsWith("@@")) {
      flush();
      if (!path) throw new Error("Patch hunk appeared before any file header.");
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) throw new Error(`Unparseable hunk header: ${line.slice(0, 120)}`);
      hunk = { path, oldStart: Number(match[1]), oldLines: [], newLines: [] };
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith("+")) hunk.newLines.push(line.slice(1));
    else if (line.startsWith("-")) hunk.oldLines.push(line.slice(1));
    else if (line.startsWith(" ")) { hunk.oldLines.push(line.slice(1)); hunk.newLines.push(line.slice(1)); }
    else if (line.startsWith("\\")) continue;
    else if (line.trim() === "") { hunk.oldLines.push(""); hunk.newLines.push(""); }
    else throw new Error(`Unexpected patch line: ${line.slice(0, 120)}`);
  }
  flush();
  if (files.size === 0) throw new Error("The patch contained no file hunks.");
  return files;
}

/** Apply hunks to one file's text. Context must match exactly; a mismatch refuses the whole patch. */
function applyHunks(original: string, hunks: PatchHunk[]): string {
  const lines = original.split("\n");
  // Applied bottom-up so earlier hunk offsets stay valid without bookkeeping.
  for (const hunk of [...hunks].sort((a, b) => b.oldStart - a.oldStart)) {
    const start = hunk.oldStart - 1;
    const actual = lines.slice(start, start + hunk.oldLines.length);
    if (actual.join("\n") !== hunk.oldLines.join("\n")) {
      throw new Error(`Patch context does not match at ${hunk.path}:${hunk.oldStart}; the file changed since the diff was produced.`);
    }
    lines.splice(start, hunk.oldLines.length, ...hunk.newLines);
  }
  return lines.join("\n");
}

export function filesystemCapabilities(quota?: WorkspaceQuota) {
  // P1.33 rollback support: the previous content of the last write per path,
  // taken before the write so the broker's rollback path can restore it.
  //
  // Keyed by workspace AND path, and each entry also records the content this
  // call wrote. Both halves close a measured defect. An independent audit found
  // two sessions writing the same relative path corrupting each other, and
  // reading the code confirmed the mechanism: `filesystemCapabilities()` runs
  // once in the engine constructor (engine.ts:1798), one engine serves every
  // session, and the key was the raw input path — so `shared.txt` in one
  // workspace and `shared.txt` in another shared one entry. Reproduced: after a
  // rollback, one session's file held the other session's content.
  //
  // The recorded content matters for a second reason. A replayed idempotency key
  // never runs `execute` — the effect journal returns the cached result — yet
  // the broker still rolls back when verify fails. The stale entry then undid a
  // write this call never made, and the audit measured the target file deleted
  // from disk (a null backup means "it did not exist", so rollback removed it).
  // Writes here are atomic, so a call that failed left no partial state to undo;
  // rollback therefore only acts when the file still holds what this call wrote.
  interface WriteBackup {
    readonly previous: string | null;
    readonly written: string;
  }
  interface BinaryBackup {
    readonly previous: Buffer | null;
    readonly written: Buffer;
  }
  const writeBackups = new Map<string, WriteBackup>();
  const binaryBackups = new Map<string, BinaryBackup>();
  const backupKey = (workspace: string, path: string) => `${workspace}\u0000${path}`;
  return [
    defineCapability(
      {
        id: "filesystem.read",
        version: "1.1.0",
        description: "Read a UTF-8 text file inside the assigned workspace. Large files are streamed, not buffered: reading stops at maxChars, and offsetBytes/limitBytes read a window without loading the rest of the file.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
      },
      z.object({
        path: z.string().min(1),
        maxChars: z.number().int().positive().max(1_000_000).optional(),
        offsetBytes: z.number().int().min(0).optional(),
        limitBytes: z.number().int().positive().max(64 * 1024 * 1024).optional(),
      }),
      async ({ path, maxChars = 200_000, offsetBytes, limitBytes }, context) => {
        const actual = await confinedPath(context.workspacePath, path);
        const info = await stat(actual);
        const start = Math.min(offsetBytes ?? 0, info.size);
        const end = limitBytes !== undefined ? Math.min(info.size, start + limitBytes) : info.size;
        // P1.34 large-file streaming: the file is read as a stream and the
        // read is abandoned as soon as the character budget is met, so a huge
        // file costs a bounded buffer rather than its full size. Windowed
        // reads (offsetBytes) never touch the bytes before the window.
        let content = "";
        let truncated = false;
        await new Promise<void>((resolve, reject) => {
          const stream = createReadStream(actual, { start, end: Math.max(start, end - 1) });
          let settled = false;
          const finish = (): void => {
            if (settled) return;
            settled = true;
            resolve();
          };
          stream.on("data", (chunk: unknown) => {
            content += Buffer.from(chunk as Uint8Array).toString("utf8");
            if (content.length >= maxChars) {
              truncated = true;
              stream.destroy();
              finish();
            }
          });
          stream.on("end", finish);
          stream.on("close", finish);
          stream.on("error", reject);
        });
        const returned = content.slice(0, maxChars);
        return {
          path,
          content: returned,
          truncated,
          chars: returned.length,
          fileBytes: info.size,
          ...(offsetBytes !== undefined ? { bytesSkipped: start } : {}),
        };
      },
      {
        idempotency: "inherent",
        output: z.object({
          path: z.string(),
          content: z.string(),
          truncated: z.boolean(),
          chars: z.number(),
          fileBytes: z.number(),
          bytesSkipped: z.number().optional(),
        }),
      },
    ),

    defineCapability(
      {
        id: "filesystem.write",
        version: "1.1.0",
        description: "Atomically write a UTF-8 file inside the assigned workspace, under its quota. The broker verifies the write took effect and restores the previous content if the call fails.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({ path: z.string().min(1), content: z.string().max(2_000_000) }),
      async ({ path, content }, context) => {
        const actual = await confinedPath(context.workspacePath, path, true);
        await mkdir(dirname(actual), { recursive: true });
        const before = await stat(actual).then((info) => info.size, () => 0);
        // P1.34 quota: refuse before writing, not after the disk is full.
        if (quota) await quota.assertCanWrite(context.workspacePath, before, Buffer.byteLength(content), "filesystem.write");
        const key = backupKey(context.workspacePath, path);
        writeBackups.set(key, {
          previous: await readFile(actual, "utf8").then((value) => value, () => null),
          written: content,
        });
        await atomicWrite(actual, content);
        // The backup only has to live across the write itself. `atomicWrite`
        // writes beside the target and renames, so a call that throws leaves the
        // file exactly as it was and there is nothing to undo; a call that
        // returns has its content on disk and a later rollback must not undo it.
        //
        // That last half is the measured defect. Replaying an idempotency key
        // never runs this handler — the effect journal returns the cached
        // result — yet the broker still rolls back when verify fails. The
        // surviving entry then undid the *earlier, verified* write, and because
        // the file had been new the backup was null, so rollback deleted the
        // file. An independent audit measured exactly that: same key, different
        // payload, target gone from disk.
        writeBackups.delete(key);
        if (quota) quota.recordDelta(context.workspacePath, Buffer.byteLength(content) - before);
        return { path, writtenChars: content.length };
      },
      {
        idempotency: "keyed",
        output: z.object({ path: z.string(), writtenChars: z.number() }),
        verify: async (_output, _context, input) => {
          const actual = await confinedPath(_context.workspacePath, input.path, false).catch(() => undefined);
          if (!actual) return { ok: false, reason: "the target path is not readable inside the workspace" };
          const onDisk = await readFile(actual, "utf8").catch(() => undefined);
          if (onDisk !== input.content) return { ok: false, reason: "the file on disk does not contain what was written" };
          return { ok: true };
        },
        rollback: async (input, context) => {
          const key = backupKey(context.workspacePath, input.path);
          const entry = writeBackups.get(key);
          if (entry === undefined) return { rolledBack: false, detail: "no execution was recorded for this write" };
          const actual = await confinedPath(context.workspacePath, input.path, true).catch(() => undefined);
          if (!actual) return { rolledBack: false, detail: "the target path cannot be resolved inside the workspace" };
          // Only undo a write this call actually made. The write is atomic, so a
          // call that failed left nothing partial behind; if the file does not
          // hold what this call wrote, the change on disk belongs to someone
          // else and restoring over it would destroy their work.
          const current = await readFile(actual, "utf8").catch(() => undefined);
          if (current !== entry.written) {
            writeBackups.delete(key);
            return {
              rolledBack: false,
              detail:
                "the file does not hold what this call wrote, so there is nothing of this call to undo; " +
                "restoring the backup would overwrite someone else's change",
            };
          }
          if (entry.previous === null) {
            await rm(actual, { force: true });
          } else {
            await atomicWrite(actual, entry.previous);
          }
          writeBackups.delete(key);
          return { rolledBack: true };
        },
      },
    ),
    defineCapability(
      {
        id: "filesystem.write_binary",
        version: "1.1.0",
        description: "Atomically decode and write a bounded base64 binary file inside the assigned workspace, under its quota. The broker verifies the digest of what landed and restores the previous bytes if the call fails.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({
        path: z.string().min(1),
        base64: z.string().min(1).max(4_194_304),
        expectedSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
      }),
      async ({ path, base64, expectedSha256 }, context) => {
        const normalized = base64.replace(/\s+/g, "");
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) throw new Error("Binary upload base64 is malformed.");
        const bytes = Buffer.from(normalized, "base64");
        if (bytes.length === 0 || bytes.length > 3 * 1024 * 1024) throw new Error("Binary upload exceeds the 3 MiB limit.");
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) throw new Error("Binary upload SHA-256 verification failed.");
        const actual = await confinedPath(context.workspacePath, path, true);
        await mkdir(dirname(actual), { recursive: true });
        const before = await stat(actual).then((info) => info.size, () => 0);
        if (quota) await quota.assertCanWrite(context.workspacePath, before, bytes.length, "filesystem.write_binary");
        const key = backupKey(context.workspacePath, path);
        binaryBackups.set(key, {
          previous: await readFile(actual).then((value) => Buffer.from(value), () => null),
          written: bytes,
        });
        await atomicWriteBuffer(actual, bytes);
        // See the text path: an atomic write leaves no partial state, so the
        // entry must not outlive the call that made it.
        binaryBackups.delete(key);
        if (quota) quota.recordDelta(context.workspacePath, bytes.length - before);
        return { path, bytes: bytes.length, sha256 };
      },
      {
        idempotency: "keyed",
        output: z.object({ path: z.string(), bytes: z.number(), sha256: z.string() }),
        verify: async (_output, _context, input) => {
          const actual = await confinedPath(_context.workspacePath, input.path, false).catch(() => undefined);
          if (!actual) return { ok: false, reason: "the target path is not readable inside the workspace" };
          const onDisk = await readFile(actual).catch(() => undefined);
          if (onDisk === undefined) return { ok: false, reason: "the written bytes are not readable" };
          const digest = createHash("sha256").update(onDisk).digest("hex");
          const normalized = input.base64.replace(/\s+/g, "");
          if (digest !== createHash("sha256").update(Buffer.from(normalized, "base64")).digest("hex")) {
            return { ok: false, reason: "the bytes on disk do not digest to what was written" };
          }
          return { ok: true };
        },
        rollback: async (input, context) => {
          const key = backupKey(context.workspacePath, input.path);
          const entry = binaryBackups.get(key);
          if (entry === undefined) return { rolledBack: false, detail: "no execution was recorded for this write" };
          const actual = await confinedPath(context.workspacePath, input.path, true).catch(() => undefined);
          if (!actual) return { rolledBack: false, detail: "the target path cannot be resolved inside the workspace" };
          // As with the text path: undo only this call's own write.
          const current = await readFile(actual).catch(() => undefined);
          if (current === undefined || !current.equals(entry.written)) {
            binaryBackups.delete(key);
            return {
              rolledBack: false,
              detail:
                "the file does not hold the bytes this call wrote, so there is nothing of this call to undo; " +
                "restoring the backup would overwrite someone else's change",
            };
          }
          if (entry.previous === null) {
            await rm(actual, { force: true });
          } else {
            await atomicWriteBuffer(actual, entry.previous);
          }
          binaryBackups.delete(key);
          return { rolledBack: true };
        },
      },
    ),
    defineCapability(
      {
        id: "filesystem.list",
        version: "1.0.0",
        description: "List files recursively inside the workspace with bounded output.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
      },
      z.object({ path: z.string().default("."), maxEntries: z.number().int().positive().max(5000).optional() }),
      async ({ path, maxEntries = 500 }, context) => {
        const base = await confinedPath(context.workspacePath, path);
        const entries: Array<{ path: string; type: string; size?: number }> = [];
        async function walk(directory: string): Promise<void> {
          for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entries.length >= maxEntries) return;
            if ([".git", "node_modules", ".venv"].includes(entry.name)) continue;
            const full = resolve(directory, entry.name);
            const rel = relative(context.workspacePath, full);
            if (entry.isSymbolicLink()) {
              entries.push({ path: rel, type: "symlink" });
            } else if (entry.isDirectory()) {
              entries.push({ path: rel, type: "directory" });
              await walk(full);
            } else if (entry.isFile()) {
              entries.push({ path: rel, type: "file", size: (await stat(full)).size });
            }
          }
        }
        await walk(base);
        return { entries, truncated: entries.length >= maxEntries };
      },
    ),
    defineCapability(
      {
        id: "filesystem.glob",
        version: "1.0.0",
        description: "Find files by glob pattern (for example src/**/*.ts) inside the workspace, newest first.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
      },
      z.object({
        pattern: z.string().min(1).max(500),
        path: z.string().max(1000).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }),
      async ({ pattern, path, limit = 200 }, context) => {
        const root = await realpath(context.workspacePath);
        const base = await confinedPath(context.workspacePath, path ?? ".");
        const matcher = globToRegExp(pattern);
        const matches: Array<{ path: string; size: number; modifiedAt: string }> = [];
        let scanned = 0;
        for await (const file of walkFiles(root, base)) {
          scanned++;
          // The pattern is relative to the directory that was searched, which is what a caller who
          // passed `path: "src"` and `*.md` means; the reported path stays workspace-relative.
          const candidate = relative(base, file.absolute);
          if (!matcher.test(candidate) && !matcher.test(file.relative)) continue;
          const info = await stat(file.absolute).catch(() => undefined);
          if (!info) continue;
          matches.push({ path: file.relative, size: info.size, modifiedAt: new Date(info.mtimeMs).toISOString() });
        }
        // Newest first: when an agent asks "which files match", the ones just touched are the answer
        // it usually wants, and a stable order beats filesystem order.
        matches.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
        return { pattern, scannedFiles: scanned, matches: matches.slice(0, limit), truncated: matches.length > limit };
      },
    ),
    defineCapability(
      {
        id: "filesystem.grep",
        version: "1.0.0",
        description: "Search file contents by regular expression inside the workspace, returning matching lines with their line numbers.",
        risk: "workspace_read",
        sideEffect: false,
        source: "core",
      },
      z.object({
        pattern: z.string().min(1).max(1000),
        path: z.string().max(1000).optional(),
        include: z.string().max(500).optional(),
        ignoreCase: z.boolean().optional(),
        maxMatches: z.number().int().min(1).max(2000).optional(),
        contextLines: z.number().int().min(0).max(5).optional(),
      }),
      async ({ pattern, path, include, ignoreCase, maxMatches = 200, contextLines = 0 }, context) => {
        const root = await realpath(context.workspacePath);
        const base = await confinedPath(context.workspacePath, path ?? ".");
        let expression: RegExp;
        try {
          expression = new RegExp(pattern, ignoreCase ? "i" : "");
        } catch (error) {
          throw new Error(`Invalid search pattern: ${(error as Error).message}`);
        }
        const includeMatcher = include ? globToRegExp(include.includes("/") ? include : `**/${include}`) : undefined;
        const matches: Array<{ path: string; line: number; text: string; before?: string[]; after?: string[] }> = [];
        let scanned = 0;
        let skippedBinary = 0;
        let truncated = false;
        for await (const file of walkFiles(root, base)) {
          if (matches.length >= maxMatches) { truncated = true; break; }
          if (includeMatcher && !includeMatcher.test(relative(base, file.absolute)) && !includeMatcher.test(file.relative)) continue;
          const info = await stat(file.absolute).catch(() => undefined);
          if (!info || info.size > MAX_SEARCHED_FILE_BYTES) continue;
          const buffer = await readFile(file.absolute).catch(() => undefined);
          if (!buffer) continue;
          // A grep that dumps a binary blob into a transcript is worse than one that says it skipped it.
          if (looksBinary(buffer)) { skippedBinary++; continue; }
          scanned++;
          const lines = buffer.toString("utf8").split("\n");
          for (let index = 0; index < lines.length; index++) {
            if (matches.length >= maxMatches) { truncated = true; break; }
            if (!expression.test(lines[index]!)) continue;
            matches.push({
              path: file.relative,
              line: index + 1,
              text: lines[index]!.slice(0, 2000),
              ...(contextLines > 0 ? { before: lines.slice(Math.max(0, index - contextLines), index).map((item) => item.slice(0, 2000)) } : {}),
              ...(contextLines > 0 ? { after: lines.slice(index + 1, index + 1 + contextLines).map((item) => item.slice(0, 2000)) } : {}),
            });
          }
        }
        return { pattern, searchedFiles: scanned, skippedBinaryFiles: skippedBinary, matches, truncated };
      },
    ),
    defineCapability(
      {
        id: "filesystem.patch",
        version: "1.0.0",
        description: "Apply a unified diff to files in the workspace, all or nothing. Context must match exactly; dryRun reports what would change.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({ diff: z.string().min(1).max(2_000_000), dryRun: z.boolean().optional() }),
      async ({ diff, dryRun }, context) => {
        const files = parseUnifiedDiff(diff);
        const planned: Array<{ path: string; hunks: number; before: number; after: number; created: boolean }> = [];
        const writes: Array<{ absolute: string; content: string }> = [];
        for (const [path, hunks] of files) {
          const target = await confinedPath(context.workspacePath, path, true);
          const original = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
          });
          const created = original === undefined;
          // A patch against a file that does not exist may only add lines: anything else is claiming
          // context that was never there.
          if (created && hunks.some((hunk) => hunk.oldLines.length > 0)) {
            throw new Error(`Patch expects existing content in ${path}, but the file does not exist.`);
          }
          const next = created ? hunks.flatMap((hunk) => hunk.newLines).join("\n") : applyHunks(original!, hunks);
          planned.push({
            path,
            hunks: hunks.length,
            before: created ? 0 : original!.split("\n").length,
            after: next.split("\n").length,
            created,
          });
          writes.push({ absolute: target, content: next });
        }
        // Every file is parsed and matched before anything is written, so a patch that fails halfway
        // through leaves the workspace exactly as it was.
        if (!dryRun) {
          for (const write of writes) {
            await mkdir(dirname(write.absolute), { recursive: true });
            // P1.34 quota on the projected result of each patched file.
            if (quota) {
              const before = await stat(write.absolute).then((info) => info.size, () => 0);
              const after = Buffer.byteLength(write.content);
              await quota.assertCanWrite(context.workspacePath, before, after, "filesystem.patch");
              quota.recordDelta(context.workspacePath, after - before);
            }
            await atomicWrite(write.absolute, write.content);
          }
        }
        return { applied: !dryRun, files: planned };
      },
    ),
    defineCapability(
      {
        id: "filesystem.lock",
        version: "1.0.0",
        description: "Take an advisory exclusive lock on one workspace path (cross-process, O_EXCL lock file). A held lock is refused; a stale lock past its TTL is taken over. Locks live under .aurora-locks and never touch the target file.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({ path: z.string().min(1), ttlMs: z.number().int().min(1_000).max(24 * 60 * 60_000).optional() }),
      async ({ path, ttlMs = 10 * 60_000 }, context) => {
        const root = await realpath(context.workspacePath);
        const normalized = relative(root, resolve(root, path));
        if (normalized.startsWith(`..${sep}`) || normalized === ".." || normalized.startsWith(sep)) throw new Error("Path escapes the assigned workspace.");
        const locksDir = join(root, ".aurora-locks");
        await mkdir(locksDir, { recursive: true });
        const lockPath = join(locksDir, `${createHash("sha256").update(normalized).digest("hex").slice(0, 40)}.json`);
        // A stale lock (past its TTL) is swept before the attempt: a lock whose
        // holder died must not fence the workspace forever.
        const existing = await readFile(lockPath, "utf8").then((value) => JSON.parse(value) as { sessionId?: string; createdAt?: string }, () => undefined);
        if (existing?.createdAt && Date.now() - Date.parse(existing.createdAt) > ttlMs) {
          await rm(lockPath, { force: true });
        } else if (existing) {
          throw new Error(`Path "${path}" is already locked${typeof existing.sessionId === "string" ? ` by session ${existing.sessionId.slice(0, 8)}` : ""}.`);
        }
        const createdAt = new Date().toISOString();
        // O_EXCL: the create itself is the arbitration — two racers cannot both
        // create the same lock file, whoever the stale sweep favoured.
        const handle = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "EEXIST") throw new Error(`Path "${path}" is already locked.`);
          throw error;
        });
        await writeFile(handle, `${JSON.stringify({ path: normalized, sessionId: context.sessionId, createdAt })}\n`);
        await handle.close();
        return { path: normalized, locked: true, createdAt, ttlMs };
      },
    ),
    defineCapability(
      {
        id: "filesystem.unlock",
        version: "1.0.0",
        description: "Release a workspace path lock. Only the session that holds the lock may release it.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({ path: z.string().min(1) }),
      async ({ path }, context) => {
        const root = await realpath(context.workspacePath);
        const normalized = relative(root, resolve(root, path));
        if (normalized.startsWith(`..${sep}`) || normalized === ".." || normalized.startsWith(sep)) throw new Error("Path escapes the assigned workspace.");
        const lockPath = join(root, ".aurora-locks", `${createHash("sha256").update(normalized).digest("hex").slice(0, 40)}.json`);
        const existing = await readFile(lockPath, "utf8").then((value) => JSON.parse(value) as { sessionId?: string }, () => undefined);
        if (!existing) throw new Error(`Path "${path}" is not locked.`);
        if (existing.sessionId !== context.sessionId) throw new Error(`Path "${path}" is locked by another session and cannot be unlocked from here.`);
        await rm(lockPath, { force: true });
        return { path: normalized, unlocked: true };
      },
    ),
    defineCapability(
      {
        id: "filesystem.archive.extract",
        version: "1.0.0",
        description: "Safely extract a tar/tgz archive from the workspace into the workspace. Only regular files and directories are extracted; traversal paths, symlinks, devices and oversized archives are refused before anything is written.",
        risk: "workspace_write",
        sideEffect: true,
        source: "core",
      },
      z.object({
        archivePath: z.string().min(1),
        intoDirectory: z.string().min(1).max(500).optional(),
      }),
      async ({ archivePath, intoDirectory }, context) => {
        const archive = await confinedPath(context.workspacePath, archivePath);
        const bytes = await readFile(archive).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") throw new Error(`Archive "${archivePath}" does not exist in the workspace.`);
          throw error;
        });
        // Parse and validate the whole archive before writing a single entry:
        // a refused archive must leave the workspace untouched.
        const entries = parseSafeTar(bytes);
        if (!entries.length) return { archivePath, extractedFiles: 0, extractedBytes: 0 };
        if (quota) {
          const total = entries.reduce((sum, entry) => sum + entry.bytes.length, 0);
          await quota.assertCanWrite(context.workspacePath, 0, total, "filesystem.archive.extract");
        }
        const base = intoDirectory ?? ".";
        let extractedBytes = 0;
        for (const entry of entries) {
          const target = await confinedPath(context.workspacePath, `${base}/${entry.path}`, true);
          await mkdir(dirname(target), { recursive: true });
          await atomicWriteBuffer(target, entry.bytes);
          extractedBytes += entry.bytes.length;
        }
        if (quota) quota.recordDelta(context.workspacePath, extractedBytes);
        return { archivePath, extractedFiles: entries.length, extractedBytes };
      },
    ),
  ];
}
