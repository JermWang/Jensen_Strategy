const { cachedOrBuild, statusPayload } = require("../../lib/rewards/snapshotCache");
const { sendJson } = require("../../lib/vercel-api");

module.exports = async function handler(request, response) {
  response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  try {
    sendJson(response, 200, await cachedOrBuild("rewards_status", statusPayload));
  } catch (error) {
    sendJson(response, 200, {
      ok: true,
      degraded: true,
      reason: "reward_status_cache_unavailable",
      message: "Showing safe placeholders while reward status catches up.",
      data: null,
      error: error.message
    });
  }
};
