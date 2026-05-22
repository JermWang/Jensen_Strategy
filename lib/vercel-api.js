const { feeReceipts, holderSnapshot, operationsSummary, publicConfig, rpc, tokenBalance } = require("./dashboard-service");

function sendJson(response, status, body) {
  response.setHeader("cache-control", "no-store");
  response.status(status).json(body);
}

function requestUrl(request) {
  const host = request.headers.host || "localhost";
  return new URL(request.url || "/", `https://${host}`);
}

module.exports = {
  feeReceipts,
  holderSnapshot,
  operationsSummary,
  publicConfig,
  requestUrl,
  rpc,
  sendJson,
  tokenBalance
};
