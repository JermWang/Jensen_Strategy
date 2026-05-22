const crypto = require("node:crypto");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonical(value[key]);
        return result;
      }, {});
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

function manifestHash(manifest) {
  return crypto.createHash("sha256").update(stableJson(manifest)).digest("hex");
}

function buildManifest(epoch, holders) {
  const recipients = holders
    .filter((holder) => holder.in_holder_cap && holder.reward_raw !== "0")
    .sort((a, b) => Number(a.rank) - Number(b.rank))
    .map((holder) => ({
      rank: Number(holder.rank),
      wallet: holder.owner_wallet,
      balance_raw: String(holder.balance_raw || "0"),
      reward_raw: String(holder.reward_raw || "0"),
      ata: holder.ata_address || null
    }));

  return {
    epoch_index: Number(epoch.epoch_index),
    token_mint: epoch.token_mint,
    reward_mint: epoch.reward_mint,
    snapshot_slot: epoch.snapshot_slot ?? null,
    holder_cap: Number(epoch.holder_cap),
    total_holder_balance_raw: String(epoch.total_holder_balance_raw || "0"),
    distributable_reward_raw: String(epoch.distributable_reward_raw || "0"),
    recipients
  };
}

module.exports = {
  buildManifest,
  manifestHash,
  stableJson
};
