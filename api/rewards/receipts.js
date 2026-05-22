const { cachedOrBuild, receiptsPayload } = require("../../lib/rewards/snapshotCache");
const { sendJson } = require("../../lib/vercel-api");

module.exports = async function handler(request, response) {
  response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  try {
    sendJson(response, 200, await cachedOrBuild("rewards_receipts_latest", receiptsPayload));
  } catch (error) {
    sendJson(response, 200, {
      ok: true,
      degraded: true,
      reason: "receipts_cache_unavailable",
      message: "Receipt cache is catching up.",
      receipts: [],
      error: error.message
    });
  }
};
