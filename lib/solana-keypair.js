const fs = require("node:fs");
const bs58 = require("bs58");
const { Keypair } = require("@solana/web3.js");

function decodeBase58(value) {
  const decoder = bs58.decode || bs58.default?.decode;
  if (!decoder) throw new Error("bs58 decoder is unavailable.");
  return decoder(String(value || "").trim());
}

function envValue(names, env = process.env) {
  for (const name of names) {
    const value = env[name];
    if (value) return { name, value };
  }
  return null;
}

function readKeypairFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return Keypair.fromSecretKey(Uint8Array.from(parsed));
  if (Array.isArray(parsed.secretKey)) return Keypair.fromSecretKey(Uint8Array.from(parsed.secretKey));
  if (parsed.privateKey) return Keypair.fromSecretKey(decodeBase58(parsed.privateKey));
  throw new Error(`Keypair file ${filePath} must contain a secret-key array or privateKey.`);
}

function hasConfiguredKeypair({ base58 = [], file = [] } = {}, env = process.env) {
  return Boolean(envValue(base58, env) || envValue(file, env));
}

function readConfiguredKeypair({ base58 = [], file = [], label = "wallet" } = {}, env = process.env) {
  const base58Secret = envValue(base58, env);
  if (base58Secret) return Keypair.fromSecretKey(decodeBase58(base58Secret.value));

  const fileSecret = envValue(file, env);
  if (fileSecret) return readKeypairFile(fileSecret.value);

  const names = [...base58, ...file].join(", ");
  throw new Error(`Set one of ${names} for live ${label} signing.`);
}

module.exports = {
  hasConfiguredKeypair,
  readConfiguredKeypair
};
