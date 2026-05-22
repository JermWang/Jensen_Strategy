const { requestUrl, sendJson, tokenBalance } = require("../lib/vercel-api");

module.exports = async function handler(request, response) {
  const url = requestUrl(request);

  sendJson(response, 200, await tokenBalance(url.searchParams.get("owner"), url.searchParams.get("mint")));
};
