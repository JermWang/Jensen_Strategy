const { holdersPayload } = require("../../lib/rewards/snapshotCache");
const { sendJson } = require("../../lib/vercel-api");

module.exports = async function handler(request, response) {
  response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  try {
    sendJson(response, 200, await holdersPayload(request.query?.wallet || ""));
  } catch (error) {
    sendJson(response, 200, {
      ok: true,
      degraded: true,
      reason: "rpc_unavailable_serving_cached_snapshot",
      message: "Showing last confirmed snapshot while RPC catches up.",
      rows: [],
      holders: [],
      error: error.message
    });
  }
};
