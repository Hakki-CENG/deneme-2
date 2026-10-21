/**
 * The at-most-once guarantee of both journals, under a simulated crash.
 *
 * This is the load-bearing safety property of the persistence layer and it had no
 * test. `command-journal.test.ts` covered the happy path — a duplicate command
 * returns its durable result — and nothing covered what happens when the process
 * dies between writing `started` and writing `completed`.
 *
 * Why that gap mattered more than it looks: the natural "improvement" to a journal
 * that finds an unfinished command is to re-run it. Making that change would have
 * turned every interrupted side effect into a double execution, and the suite would
 * have stayed green, because nothing asserted the opposite. These cases assert the
 * opposite.
 *
 * The crash is simulated by writing the journal file directly rather than by killing
 * a process: the file *is* the durable state, so a `started` record with no
 * `completed` line is exactly what a crash leaves behind, and this way the case
 * states its premise instead of depending on a race.
 */
import { appendFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CommandJournal } from "../src/persistence/command-journal.js";
import { EffectJournal, EffectOutcomeUncertainError } from "../src/persistence/effect-journal.js";
import type { CommandEnvelope } from "../src/types.js";

function envelope(commandId: string): CommandEnvelope {
  return {
    protocolVersion: 1,
    commandId,
    clientId: "client",
    tenantId: "tenant",
    sessionId: "session",
    kind: "session.pause",
    source: "api",
    issuedAt: new Date().toISOString(),
    payload: {},
  };
}

/** Writes a bare journal record, which is what a crash mid-operation leaves behind. */
async function seedRecord(root: string, file: string, record: Record<string, unknown>): Promise<void> {
  const path = join(root, "journal", file);
  await mkdir(join(root, "journal"), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

async function newRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "haf-journal-crash-"));
}

describe("a command interrupted by a crash is not replayed", () => {
  it("reports an uncertain outcome and never calls the operation again", async () => {
    const root = await newRoot();
    const command = envelope("interrupted-1");
    await seedRecord(root, "commands.jsonl", {
      key: `${command.tenantId}:${command.clientId}:${command.commandId}`,
      commandId: command.commandId,
      state: "started",
      timestamp: new Date().toISOString(),
    });

    const journal = new CommandJournal(root);
    let executions = 0;
    const result = await journal.execute(command, async () => {
      executions++;
      return { commandId: command.commandId, status: "completed" as const, result: {} };
    });

    // The operation must not run: nobody knows whether the first attempt already
    // performed its side effect, so re-running it could do it twice.
    expect(executions).toBe(0);
    expect(result.status).toBe("uncertain");
    expect(result.error?.code).toBe("COMMAND_OUTCOME_UNCERTAIN");
    expect(result.error?.retryable).toBe(false);
    expect(result.error?.message).toContain("not replayed automatically");
  });

  it("still reports uncertain on a later process, because the record is durable", async () => {
    const root = await newRoot();
    const command = envelope("interrupted-2");
    await seedRecord(root, "commands.jsonl", {
      key: `${command.tenantId}:${command.clientId}:${command.commandId}`,
      commandId: command.commandId,
      state: "started",
      timestamp: new Date().toISOString(),
    });

    // A second restart must reach the same conclusion rather than forgetting.
    const second = new CommandJournal(root);
    const result = await second.execute(command, async () => ({
      commandId: command.commandId,
      status: "completed" as const,
    }));
    expect(result.status).toBe("uncertain");

    // And the uncertain answer must not have overwritten the journal with a
    // completion nobody produced.
    const lines = (await readFile(join(root, "journal", "commands.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("records a failure durably, so a retry cannot re-run the operation either", async () => {
    const root = await newRoot();
    const command = envelope("failed-1");
    const journal = new CommandJournal(root);
    let executions = 0;

    const first = await journal.execute(command, async () => {
      executions++;
      throw new Error("the backend was unreachable");
    });
    expect(first.status).toBe("rejected");
    expect(first.error?.message).toContain("the backend was unreachable");

    const reloaded = new CommandJournal(root);
    const second = await reloaded.execute(command, async () => {
      executions++;
      return { commandId: command.commandId, status: "completed" as const };
    });
    // The recorded rejection is the durable outcome. Re-running a command whose
    // first attempt failed is a different decision than replaying one that
    // succeeded, and this journal does not make it silently.
    expect(executions).toBe(1);
    expect(second.status).toBe("rejected");
  });
});

describe("an effect interrupted by a crash is not replayed", () => {
  it("throws rather than calling the operation again", async () => {
    const root = await newRoot();
    await seedRecord(root, "effects.jsonl", {
      key: "effect-interrupted",
      state: "started",
      timestamp: new Date().toISOString(),
    });

    const journal = new EffectJournal(root);
    let executions = 0;
    const error = await journal
      .execute("effect-interrupted", async () => {
        executions++;
        return { done: true };
      })
      .then(
        () => undefined,
        (thrown: unknown) => thrown as Error,
      );

    expect(executions).toBe(0);
    expect(error).toBeInstanceOf(EffectOutcomeUncertainError);
    expect(error?.message).toContain("automatic replay is blocked");
  });

  it("replays the stored result for an effect that did complete", async () => {
    const root = await newRoot();
    const journal = new EffectJournal(root);
    let executions = 0;
    const operation = async () => {
      executions++;
      return { value: executions };
    };

    expect(await journal.execute("effect-done", operation)).toEqual({ value: 1 });
    const reloaded = new EffectJournal(root);
    expect(await reloaded.execute("effect-done", operation)).toEqual({ value: 1 });
    expect(executions).toBe(1);
  });
});

/**
 * Pinned because it is a real asymmetry between the two journals, not because it is
 * obviously right. `CommandJournal` catches a thrown operation and writes a durable
 * `rejected` record, so the key settles. `EffectJournal` has no such catch: a thrown
 * operation leaves the key at `started`, and every later attempt raises
 * `EffectOutcomeUncertainError`.
 *
 * For a side effect that is the defensible answer — the effect may have partially
 * happened, so refusing to retry is safer than guessing. The cost is that a purely
 * transient failure poisons the key with no recovery path short of editing the
 * journal. This case exists so the trade-off is a stated decision rather than an
 * accident somebody rediscovered later.
 */
describe("a failed effect leaves its key blocked, unlike a failed command", () => {
  it("raises the uncertain error on every later attempt", async () => {
    const root = await newRoot();
    const journal = new EffectJournal(root);
    let executions = 0;

    await expect(
      journal.execute("effect-flaky", async () => {
        executions++;
        throw new Error("network blip");
      }),
    ).rejects.toThrow("network blip");

    const reloaded = new EffectJournal(root);
    await expect(
      reloaded.execute("effect-flaky", async () => {
        executions++;
        return { recovered: true };
      }),
    ).rejects.toBeInstanceOf(EffectOutcomeUncertainError);

    expect(executions).toBe(1);
    // The journal still holds only the `started` line: no outcome was invented.
    const lines = (await readFile(join(root, "journal", "effects.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);
  });
});

describe("concurrent duplicate calls are deduplicated rather than run twice", () => {
  it("collapses two in-flight commands into one execution", async () => {
    const root = await newRoot();
    const journal = new CommandJournal(root);
    const command = envelope("concurrent-1");
    let executions = 0;
    const operation = async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { commandId: command.commandId, status: "completed" as const, result: { n: executions } };
    };

    const [first, second] = await Promise.all([
      journal.execute(command, operation),
      journal.execute(command, operation),
    ]);
    expect(executions).toBe(1);
    expect(first).toEqual(second);
  });

  it("collapses two in-flight effects into one execution", async () => {
    const root = await newRoot();
    const journal = new EffectJournal(root);
    let executions = 0;
    const operation = async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { n: executions };
    };

    const [first, second] = await Promise.all([
      journal.execute("effect-concurrent", operation),
      journal.execute("effect-concurrent", operation),
    ]);
    expect(executions).toBe(1);
    expect(first).toEqual(second);
  });
});
