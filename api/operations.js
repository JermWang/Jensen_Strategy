const { operationsSummary, sendJson } = require("../lib/vercel-api");

module.exports = async function handler(_request, response) {
  sendJson(response, 200, await operationsSummary());
};
