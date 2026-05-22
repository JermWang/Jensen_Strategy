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
const { statusPayload } = require("../../lib/rewards/snapshotCache.js");

async function main() {
  console.log("=== Current DB epoch ===");
  const current = await store.currentEpoch();
  console.log(JSON.stringify(current, null, 2));

  console.log("\n=== Latest DB epoch ===");
  const latest = await store.latestEpoch();
  console.log(JSON.stringify(latest, null, 2));

  console.log("\n=== statusPayload ===");
  const status = await statusPayload();
  console.log(JSON.stringify(status, null, 2));
}

main().catch(console.error);
