const { requestUrl, rpc, sendJson } = require("../lib/vercel-api");

async function tokenBalance(owner, mint) {
  if (!owner || !mint) {
    return { configured: false, balance: null };
  }

  const accounts = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" }
  ]);

  const balance = accounts.value.reduce((total, account) => {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount || 0;
    return total + amount;
  }, 0);

  return { configured: true, balance };
}

module.exports = async function handler(request, response) {
  const url = requestUrl(request);

  try {
    sendJson(response, 200, await tokenBalance(url.searchParams.get("owner"), url.searchParams.get("mint")));
  } catch (error) {
    sendJson(response, 502, {
      configured: Boolean(process.env.SOLANA_RPC_URL),
      error: error.message,
      balance: null
    });
  }
};
