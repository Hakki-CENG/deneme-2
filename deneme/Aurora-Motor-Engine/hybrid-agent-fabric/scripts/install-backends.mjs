#!/usr/bin/env node
/**
 * Installs the external backends the engine's capabilities shell out to.
 *
 *     node scripts/install-backends.mjs            # Python workers only
 *     node scripts/install-backends.mjs --lean     # ... plus the Lean toolchain
 *     node scripts/install-backends.mjs --check    # report, change nothing
 *
 * The point of this script is that adding a backend should not leave a capability
 * that only works on the machine it was written on. Every capability that needs a
 * backend has a health check here, so a missing one is reported as an actionable
 * gap instead of surfacing later as a confusing failure at task time.
 *
 * Two things it deliberately does NOT do.
 *
 * It does not run by default as part of `npm install`. Installing a toolchain
 * writes to `$HOME/.elan`, puts a shim directory on PATH and downloads a
 * compiler; doing that silently as a side effect of installing node modules is not
 * acceptable. Hence `--lean` is a separate, explicit flag.
 *
 * It does not install anything that pulls PyTorch. Several backends the
 * integration plan names need it, and a multi-gigabyte download that then fails on
 * a machine without a GPU helps nobody. Those capabilities report `unavailable`.
 *
 * Idempotent: a backend whose health check passes is skipped, so this is safe to
 * re-run and safe to run in CI.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const REQUIREMENTS = join(REPO_ROOT, "packages", "engine", "external-workers", "requirements.txt");

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const WITH_LEAN = args.has("--lean");

/** Captures stdout, or null if the command failed or is missing. */
function capture(command, commandArgs) {
  const child = spawnSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (child.status !== 0) return null;
  return (child.stdout ?? "").trim();
}

function pythonPath() {
  for (const candidate of ["python3", "python"]) {
    if (capture(candidate, ["--version"])) return candidate;
  }
  return null;
}

/**
 * The backend list. `check` answers "is it usable right now"; `install` makes it
 * so. Keeping them side by side is what stops the two drifting apart — a health
 * check that does not match the thing the installer provides is worse than no
 * health check, because it reports green for a backend that cannot run.
 */
const backends = [
  {
    id: "python",
    label: "a Python 3 interpreter",
    capability: "every external worker",
    check: () => pythonPath() !== null,
    install: null,
    hint: "install Python 3.10 or newer from python.org or your package manager",
  },
  {
    id: "pip-packages",
    label: "the Python worker packages (z3-solver, sympy, duckdb, polars, biopython, rdkit, vosk, crawl4ai, fastembed, openmm, inspect-ai)",
    capability: "math.smt.solve, math.symbolic, data.*, science.* (incl. molecular dynamics), audio.transcribe, web.render, retrieval embeddings, eval.inspect.run",
    check: () => {
      const python = pythonPath();
      if (!python) return false;
      if (!existsSync(REQUIREMENTS)) return false;
      // Ask pip what it *would* install and require that list to be empty. The
      // exit code alone is not enough: `pip install --dry-run` exits 0 when
      // packages are missing, which reported these backends as present when eight
      // of them were not. Reading the report is what makes the check mean
      // something, and it matches what `pip install -r` would actually do.
      const report = join(tmpdir(), `haf-backends-${process.pid}.json`);
      const child = spawnSync(
        python,
        ["-m", "pip", "install", "--dry-run", "--report", report, "--quiet", "-r", REQUIREMENTS],
        { stdio: "ignore" },
      );
      if (child.status !== 0) return false;
      try {
        const parsed = JSON.parse(readFileSync(report, "utf8"));
        return Array.isArray(parsed.install) && parsed.install.length === 0;
      } catch {
        return false;
      } finally {
        try {
          rmSync(report, { force: true });
        } catch {
          /* a leftover temp file is not worth failing a check over */
        }
      }
    },
    install: () => {
      const python = pythonPath();
      if (!python) return { ok: false, detail: "no Python interpreter was found" };
      const child = spawnSync(python, ["-m", "pip", "install", "-r", REQUIREMENTS], { stdio: "inherit" });
      return child.status === 0
        ? { ok: true, detail: `installed from ${REQUIREMENTS}` }
        : { ok: false, detail: `pip exited with code ${child.status}` };
    },
    hint: `run: ${pythonPath() ?? "python3"} -m pip install -r ${REQUIREMENTS}`,
  },
  {
    id: "tesseract",
    label: "Tesseract OCR",
    capability: "document.parse",
    check: () => capture("tesseract", ["--version"]) !== null,
    install: null,
    hint: "a system package: apt-get install tesseract-ocr tesseract-ocr-tur poppler-utils",
  },
  {
    id: "libreoffice",
    label: "LibreOffice",
    capability: "office.convert",
    check: () => capture("soffice", ["--version"]) !== null,
    install: null,
    hint: "a system package: apt-get install libreoffice",
  },
  {
    id: "openscad",
    label: "OpenSCAD",
    capability: "cad.render",
    check: () => capture("openscad", ["--version"]) !== null,
    install: null,
    hint: "a system package: apt-get install openscad (macOS: brew install --cask openscad)",
  },
  {
    id: "lean",
    label: "the Lean 4 toolchain",
    capability: "math.lean.check",
    // elan puts its shims in $HOME/.elan/bin, which is not always on PATH for a
    // freshly installed toolchain, so check both places.
    check: () => leanBinary() !== null,
    install: WITH_LEAN
      ? () => installLean()
      : null,
    hint: "run: node scripts/install-backends.mjs --lean",
  },
];

/** Finds the `lean` binary, including elan's shim directory. */
function leanBinary() {
  if (capture("lean", ["--version"])) return "lean";
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    const elan = join(home, ".elan", "bin", process.platform === "win32" ? "lean.exe" : "lean");
    if (existsSync(elan)) return elan;
  }
  return null;
}

/**
 * Installs the Lean toolchain through elan, the official installer.
 *
 * `-y` because this script is meant to be run deliberately and should not hang
 * waiting on a prompt; `--default-toolchain leanprover/lean4:stable` so the
 * toolchain arrives with the installer rather than on first use of `lean`, which
 * would otherwise look like the install succeeded and then fail later.
 */
function installLean() {
  const script = process.platform === "win32" ? null : "https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh";
  if (!script) {
    return {
      ok: false,
      detail: "on Windows, install elan from https://github.com/leanprover/elan/releases (elan-init.exe)",
    };
  }
  const curl = capture("curl", ["--version"]) !== null ? "curl" : null;
  if (!curl) return { ok: false, detail: "curl is required to fetch the elan installer" };

  const child = spawnSync(
    "sh",
    ["-c", `curl -fsSL ${script} | sh -s -- -y --default-toolchain leanprover/lean4:stable`],
    { stdio: "inherit" },
  );
  if (child.status !== 0) return { ok: false, detail: `the elan installer exited with code ${child.status}` };
  return leanBinary()
    ? { ok: true, detail: `installed; lean resolved at ${leanBinary()}` }
    : {
        ok: true,
        detail:
          "installed, but `lean` is not on PATH yet. Add $HOME/.elan/bin to PATH " +
          "(the installer appends this to your shell profile; open a new shell or source it).",
      };
}

let missing = 0;
let installed = 0;
let failed = 0;

console.log(`backend check${CHECK_ONLY ? " (report only)" : ""}${WITH_LEAN ? ", including Lean" : ""}\n`);

for (const backend of backends) {
  const present = backend.check();
  if (present) {
    console.log(`  ok       ${backend.id.padEnd(14)} ${backend.label}`);
    continue;
  }
  missing++;
  if (CHECK_ONLY || !backend.install) {
    console.log(`  missing  ${backend.id.padEnd(14)} ${backend.label}`);
    console.log(`           needed by: ${backend.capability}`);
    console.log(`           ${backend.hint}`);
    continue;
  }
  console.log(`  install  ${backend.id.padEnd(14)} ${backend.label}`);
  const result = backend.install();
  if (result.ok) {
    installed++;
    console.log(`           done: ${result.detail}`);
  } else {
    failed++;
    console.log(`           FAILED: ${result.detail}`);
    console.log(`           needed by: ${backend.capability}`);
  }
}

console.log("");
if (failed > 0) {
  console.log(`${failed} backend(s) could not be installed; ${missing} were missing in total.`);
  console.log("A capability whose backend is missing reports status 'unavailable' rather than guessing.");
  process.exit(1);
}
if (missing > 0 && CHECK_ONLY) {
  console.log(`${missing} backend(s) missing. Re-run without --check to install what can be installed.`);
  process.exit(1);
}
console.log(
  installed > 0
    ? `${installed} backend(s) installed, ${backends.length - missing} already present.`
    : `all ${backends.length} backends present; nothing to do.`,
);
