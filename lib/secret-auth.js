const crypto = require("node:crypto");

// No hardcoded fallback hashes — auth requires ADMIN_PASSWORD, ADMIN_API_TOKEN, or CRON_SECRET in env.
const FALLBACK_ADMIN_TOKEN_HASHES = [];
const FALLBACK_CRON_SECRET_HASHES = [];

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function secretMatches(candidate, plainSecrets = [], fallbackHashes = []) {
  const value = String(candidate || "").trim();
  if (!value) return false;
  if (plainSecrets.filter(Boolean).some((secret) => timingSafeStringEqual(value, secret))) return true;
  const digest = sha256(value);
  return fallbackHashes.filter(Boolean).some((hash) => timingSafeStringEqual(digest, String(hash).toLowerCase()));
}

function hasSecretFallback(fallbackHashes = []) {
  return fallbackHashes.filter(Boolean).length > 0;
}

function adminSecretMatches(candidate) {
  return secretMatches(candidate, [process.env.ADMIN_PASSWORD, process.env.ADMIN_API_TOKEN], FALLBACK_ADMIN_TOKEN_HASHES);
}

function cronSecretMatches(candidate) {
  return secretMatches(candidate, [process.env.CRON_SECRET], FALLBACK_CRON_SECRET_HASHES);
}

function adminAuthConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD || process.env.ADMIN_API_TOKEN || hasSecretFallback(FALLBACK_ADMIN_TOKEN_HASHES));
}

function cronAuthConfigured() {
  return Boolean(process.env.CRON_SECRET || hasSecretFallback(FALLBACK_CRON_SECRET_HASHES));
}

module.exports = {
  adminAuthConfigured,
  adminSecretMatches,
  cronAuthConfigured,
  cronSecretMatches,
  FALLBACK_ADMIN_TOKEN_HASHES,
  FALLBACK_CRON_SECRET_HASHES,
  secretMatches
};
