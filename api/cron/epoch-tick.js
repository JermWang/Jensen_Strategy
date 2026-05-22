const { isAdminAuthorized, runScheduledEpoch } = require("../../lib/admin-control");
const { cronSecretMatches } = require("../../lib/secret-auth");
const { sendJson } = require("../../lib/vercel-api");

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

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
  if (!isCronAuthorized(request)) {
    sendJson(response, 401, { ok: false, error: "Cron authorization failed." });
    return;
  }

  try {
    const body = parseBody(request);
    const result = await runScheduledEpoch({
      force: body.force === true,
      source: body.source || "cron-job.org",
      payload: body.payload || {}
    });
    sendJson(response, 200, {
      ok: true,
      action: "run-due-epoch",
      result
    });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Epoch runner failed."
    });
  }
};

function isCronAuthorized(request) {
  const headers = request.headers;
  if (isAdminAuthorized(headers)) return true;
  const authorization = headerValue(headers, "authorization");
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return [bearer, headerValue(headers, "x-cron-secret")].some((candidate) => cronSecretMatches(candidate));
}
