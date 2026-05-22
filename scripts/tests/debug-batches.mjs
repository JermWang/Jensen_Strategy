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

const store = require("../../lib/rewards/store.js");

async function main() {
  const current = await store.currentEpoch();
  console.log("Current epoch ID:", current?.id);
  console.log("Current epoch status:", current?.status);
  console.log("Current epoch ends_at:", current?.ends_at);

  if (current) {
    const batches = await store.batchesForEpoch(current.id);
    console.log("\nBatches for current epoch:", batches.length);
    for (const batch of batches) {
      console.log(`  batch ${batch.batch_index}: status=${batch.status}, transfers=${batch.transfer_count}, sig=${batch.signature || "none"}`);
    }
  }
}

main().catch(console.error);
