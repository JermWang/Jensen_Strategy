import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// Load local .env
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
try {
  const text = await readFile(join(root, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (!process.env[key]) process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
} catch {
  // ignore
}

const { snapshotEligibleHolders } = require("../../lib/rewards/epochs.js");
const store = require("../../lib/rewards/store.js");

async function main() {
  console.log("TOKEN_MINT:", process.env.TOKEN_MINT || "(not set)");
  console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL || "(not set)");
  console.log("HOLDER_SNAPSHOT_PROVIDER:", process.env.HOLDER_SNAPSHOT_PROVIDER || "auto");
  console.log("HOLDER_SNAPSHOT_MIN_BALANCE:", process.env.HOLDER_SNAPSHOT_MIN_BALANCE || "0");

  // Ensure there's an epoch to snapshot against
  const latest = await store.latestEpoch();
  console.log("Latest epoch:", latest ? { id: latest.id, index: latest.epoch_index, status: latest.status, token_mint: latest.token_mint } : null);

  console.log("\nFetching holder snapshot for current TOKEN_MINT...");
  try {
    const result = await snapshotEligibleHolders(latest || { id: "test" }, process.env);
    console.log("Snapshot source:", result.snapshot?.source);
    console.log("Snapshot tokenMint:", result.snapshot?.tokenMint);
    console.log("Snapshot totalFetched:", result.snapshot?.totalFetched);
    console.log("Snapshot totalEligible:", result.snapshot?.totalEligible);
    console.log("Rows returned:", result.rows?.length);
    if (result.rows?.length > 0) {
      console.log("First 3 rows:", result.rows.slice(0, 3));
    }
    if (result.snapshot?.notice) {
      console.log("Snapshot notice:", result.snapshot.notice);
    }
    if (result.snapshot?.providerError) {
      console.log("Provider error:", result.snapshot.providerError);
    }
  } catch (error) {
    console.error("Snapshot failed:", error.message);
    console.error(error.stack);
  }
}

main().catch(console.error);
