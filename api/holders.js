const { holderSnapshot, requestUrl, sendJson } = require("../lib/vercel-api");

module.exports = async function handler(request, response) {
  const url = requestUrl(request);

  sendJson(response, 200, await holderSnapshot(url.searchParams.get("wallet")));
};
