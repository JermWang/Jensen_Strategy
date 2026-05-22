const { epochTick, isCronAuthorized } = require("../../lib/rewards/epochs");
const { sendJson } = require("../../lib/vercel-api");

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;
  try {
    return JSON.parse(request.body);
  } catch {
    return {};
  }
}

module.exports = async function handler(request, response) {
  response.setHeader("cache-control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }
  if (!isCronAuthorized(request.headers)) {
    sendJson(response, 401, { ok: false, error: "Cron authorization failed." });
    return;
  }

  const body = parseBody(request);
  const result = await epochTick({
    source: body.source || "cron-job.org",
    task: body.task || "epoch-tick"
  });
  sendJson(response, result.ok === false ? 500 : 200, result);
};
