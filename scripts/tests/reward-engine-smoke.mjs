import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const root = mkdtempSync(join(tmpdir(), "btc-pizza-rewards-"));
process.env.ADMIN_STORAGE_PATH = root;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
delete process.env.POSTGRES_URL_NON_POOLING;

const { epochIntervalSeconds } = require("../../lib/rewards/config.js");
const { calculatePayouts } = require("../../lib/rewards/distribution.js");
const { closeDueEpoch, ensureInitialEpoch, epochTick } = require("../../lib/rewards/epochs.js");
const { holdersPayload, statusPayload } = require("../../lib/rewards/snapshotCache.js");
const { lookupWallet } = require("../../lib/rewards/ticketLookup.js");
const store = require("../../lib/rewards/store.js");

try {
  assert.equal(epochIntervalSeconds(0), 180, "epoch 0 interval");
  assert.equal(epochIntervalSeconds(1), 243, "epoch 1 interval");
  assert.equal(epochIntervalSeconds(2), 328, "epoch 2 interval");
  assert.equal(epochIntervalSeconds(3), 442, "epoch 3 interval");
  assert.equal(epochIntervalSeconds(4), 597, "epoch 4 interval");
  assert.equal(epochIntervalSeconds(5), 807, "epoch 5 interval");
  assert.equal(epochIntervalSeconds(1000), 86400, "interval cap");

  const tick = await epochTick();
  assert.equal(tick.ok, true);
  assert.equal(tick.status, "scheduled");
  assert.equal(tick.reason, "not_due");

  const first = await ensureInitialEpoch();
  assert.equal(first.epoch_index, 0);
  assert.equal(first.interval_seconds, 180);

  const skipped = await closeDueEpoch(first, { rewardPool: { raw: "0", decimals: 8 } });
  assert.equal(skipped.status, "skipped_no_rewards");
  const next = await store.latestEpoch();
  assert.equal(next.epoch_index, 1);
  assert.equal(next.interval_seconds, 243);

  const payout = calculatePayouts(
    [
      { wallet: "walletA", balanceRaw: "100" },
      { wallet: "walletB", balanceRaw: "50" },
      { wallet: "walletC", balanceRaw: "50" }
    ],
    "101",
    { holderCap: 128, minRewardDustAtomic: 1n, rewardDecimals: 8 }
  );
  assert.deepEqual(
    payout.rows.map((row) => row.rewardRaw),
    ["50", "25", "25"],
    "proportional payouts"
  );
  assert.equal(payout.leftoverRewardRaw, "1", "rounding dust remains");

  const due = await store.updateEpoch(next.id, {
    ends_at: new Date(Date.now() - 1000).toISOString(),
    status: "scheduled"
  });
  const holders = {
    snapshot: { source: "test", slot: 123 },
    sourceRpc: "test",
    rows: [
      { wallet: "walletA", balanceRaw: "100", balanceUi: "100" },
      { wallet: "walletB", balanceRaw: "50", balanceUi: "50" }
    ]
  };
  const distributed = await closeDueEpoch(due, { rewardPool: { raw: "300", decimals: 8 }, holderSnapshot: holders });
  assert.equal(distributed.status, "distributing");

  const board = await holdersPayload("walletA");
  assert.equal(board.rows.length, 2);
  assert.equal(board.current.wallet, "walletA");
  assert.equal(board.current.reward_raw, "200");

  const ticket = await lookupWallet("walletZ");
  assert.equal(ticket.reason, "not_in_top_128");

  const status = await statusPayload();
  assert.equal(status.ok, true);
  assert.equal(Boolean(status.current_epoch), true);

  const before = board.rows.length;
  const repeat = await closeDueEpoch(due, { rewardPool: { raw: "300", decimals: 8 }, holderSnapshot: holders });
  assert.equal(repeat.status, "distributing");
  const after = await holdersPayload();
  assert.equal(after.rows.length, before, "duplicate close does not duplicate holders");

  console.log("Reward engine smoke passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
