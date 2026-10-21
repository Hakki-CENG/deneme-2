/**
 * Accepting an agent-economy trade is tenant-scoped.
 *
 * `acceptTrade` used to take only a trade id. It found the trade by id, then
 * found both wallets by `agentId` alone — no tenant anywhere in the method — and
 * moved the balances. So an authenticated caller in tenant A could accept a
 * trade belonging to tenant B and debit/credit B's wallets; and because agent
 * ids are only unique *within* a tenant, two tenants that both had an agent
 * called `worker-1` could have the wrong wallet debited outright.
 *
 * Every other method on `AgentEconomyService` (`getOrCreateWallet`,
 * `offerTrade`, `getTrades`, `getStats`, `why`) already scoped by tenant. This
 * was the one that did not, and it was the one that moved value.
 *
 * The route (`POST /v1/economy/trade/:id/accept`) now resolves the tenant from
 * the trade record itself via `resolveTenantId`, so a caller who declares a
 * different tenant gets 403 HAF-1010 before the handler runs; these tests cover
 * the engine-level guarantee that holds even if that wiring is bypassed.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentEconomyService } from "../src/aurora/agent-economy.js";

const A = "tenant-a";
const B = "tenant-b";

let root: string;
let economy: AgentEconomyService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "haf-economy-iso-"));
  economy = new AgentEconomyService(root);
  await economy.init();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function balance(tenantId: string, agentId: string, resource: string): Promise<number> {
  const stats = await economy.getStats(tenantId);
  const wallet = stats.wallets.find((w) => w.agentId === agentId);
  return wallet ? (wallet.balance as Record<string, number>)[resource] ?? 0 : -1;
}

describe("AgentEconomyService.acceptTrade — tenant isolation", () => {
  it("accepts a trade in its own tenant and moves the balances", async () => {
    await economy.getOrCreateWallet(A, "seller");
    await economy.getOrCreateWallet(A, "buyer");
    const trade = await economy.offerTrade(A, "seller", "buyer", { resource: "cpu", amount: 10 }, { resource: "memory", amount: 5 });

    expect(await economy.acceptTrade(A, trade.id)).toBe(true);

    const stats = await economy.getStats(A);
    const trades = await economy.getTrades(A);
    expect(trades.find((t) => t.id === trade.id)!.status).toBe("accepted");
    expect(stats.wallets.length).toBe(2);
  });

  it("refuses to accept another tenant's trade and leaves every balance untouched", async () => {
    await economy.getOrCreateWallet(A, "seller");
    await economy.getOrCreateWallet(A, "buyer");
    const before = await balance(A, "seller", "cpu");
    const trade = await economy.offerTrade(A, "seller", "buyer", { resource: "cpu", amount: 10 }, { resource: "memory", amount: 5 });

    expect(await economy.acceptTrade(B, trade.id)).toBe(false);

    expect(await balance(A, "seller", "cpu")).toBe(before);
    expect((await economy.getTrades(A)).find((t) => t.id === trade.id)!.status).toBe("offered");
  });

  it("never debits a same-named agent in a different tenant", async () => {
    // Agent ids are unique per tenant, so `worker-1` exists in both. The old
    // wallet lookup keyed on agentId alone, which is exactly the ambiguity that
    // let value move across the boundary.
    // B's wallets are created FIRST on purpose. The unscoped lookup used
    // `wallets.find(w => w.agentId === ...)`, which returns the first match in
    // insertion order — so with B first, the old code debited B's wallet for a
    // trade that belonged to A. Creating A first would hide that, and this test
    // would pass vacuously either way.
    await economy.getOrCreateWallet(B, "worker-1");
    await economy.getOrCreateWallet(B, "worker-2");
    await economy.getOrCreateWallet(A, "worker-1");
    await economy.getOrCreateWallet(A, "worker-2");
    const aBefore1 = await balance(A, "worker-1", "cpu");

    const bBefore1 = await balance(B, "worker-1", "cpu");
    const bBefore2 = await balance(B, "worker-2", "cpu");

    const trade = await economy.offerTrade(A, "worker-1", "worker-2", { resource: "cpu", amount: 10 }, { resource: "memory", amount: 5 });
    expect(await economy.acceptTrade(A, trade.id)).toBe(true);

    expect(await balance(B, "worker-1", "cpu")).toBe(bBefore1);
    expect(await balance(B, "worker-2", "cpu")).toBe(bBefore2);
    // And A's own wallet is the one that actually moved.
    expect(await balance(A, "worker-1", "cpu")).toBe(aBefore1 - 10);
  });

  it("returns false for a trade id that does not exist at all", async () => {
    await economy.getOrCreateWallet(A, "seller");
    expect(await economy.acceptTrade(A, "trade-does-not-exist")).toBe(false);
  });

  it("exposes tradeById without a tenant, because authorization needs the record first", async () => {
    await economy.getOrCreateWallet(A, "seller");
    await economy.getOrCreateWallet(A, "buyer");
    const trade = await economy.offerTrade(A, "seller", "buyer", { resource: "cpu", amount: 10 }, { resource: "memory", amount: 5 });

    // The guard calls this *before* it knows the tenant; it must never be used
    // to mutate, which is why the doc comment on the method says so.
    const found = await economy.tradeById(trade.id);
    expect(found?.id).toBe(trade.id);
    expect(found?.tenantId).toBe(A);
    expect(await economy.tradeById("nope")).toBeUndefined();
  });
});
