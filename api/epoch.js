const { adminAuthError, isAdminAuthorized, runScheduledEpoch } = require("../lib/admin-control");
const { sendJson } = require("../lib/vercel-api");

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  const exact = headers[name] || headers[name.toLowerCase()];
  if (Array.isArray(exact)) return exact[0] || "";
  return exact || "";
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

function isCronAuthorized(headers) {
  if (isAdminAuthorized(headers)) return true;
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const authorization = headerValue(headers, "authorization");
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return bearer === secret || headerValue(headers, "x-cron-secret") === secret;
}

module.exports = async function handler(request, response) {
  if (!isCronAuthorized(request.headers)) {
    sendJson(response, 401, {
      ok: false,
      error: process.env.CRON_SECRET ? "Epoch cron authorization failed." : adminAuthError()
    });
    return;
  }

  if (!["GET", "POST"].includes(request.method)) {
    response.setHeader("allow", "GET, POST");
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const body = request.method === "POST" ? parseBody(request) : {};
    const result = await runScheduledEpoch({
      force: body.force === true || request.query?.force === "true",
      source: body.source || "cron",
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
