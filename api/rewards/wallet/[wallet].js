const { rateLimit } = require("../../../lib/rpc/rateLimit");
const { lookupWallet } = require("../../../lib/rewards/ticketLookup");
const { sendJson } = require("../../../lib/vercel-api");

function ipFor(request) {
  return (
    request.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    request.headers["x-real-ip"] ||
    request.socket?.remoteAddress ||
    "unknown"
  );
}

module.exports = async function handler(request, response) {
  response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  const wallet = String(request.query?.wallet || request.query?.slug || "").trim();
  const limit = rateLimit(`ticket:${ipFor(request)}:${wallet.toLowerCase()}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) {
    sendJson(response, 429, { ok: false, error: "Ticket lookup rate limit exceeded.", reset_at: limit.resetAt });
    return;
  }
  sendJson(response, 200, await lookupWallet(wallet));
};
