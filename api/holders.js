const { requestUrl, sendJson } = require("../lib/vercel-api");

async function holderSnapshot(wallet) {
  if (!process.env.HOLDER_INDEXER_API_URL) {
    return {
      configured: false,
      reason: "HOLDER_INDEXER_API_URL is not configured",
      wallet: wallet || "",
      current: null,
      holders: []
    };
  }

  const url = new URL(process.env.HOLDER_INDEXER_API_URL);
  if (wallet) url.searchParams.set("wallet", wallet);

  const result = await fetch(url, { headers: { accept: "application/json" } });
  if (!result.ok) {
    throw new Error(`Holder indexer failed: ${result.status}`);
  }
  return await result.json();
}

module.exports = async function handler(request, response) {
  const url = requestUrl(request);

  try {
    sendJson(response, 200, await holderSnapshot(url.searchParams.get("wallet")));
  } catch (error) {
    sendJson(response, 502, {
      configured: Boolean(process.env.HOLDER_INDEXER_API_URL),
      error: error.message,
      holders: []
    });
  }
};
