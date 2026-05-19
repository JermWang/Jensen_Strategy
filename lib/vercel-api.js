const DEFAULT_WBTC_MINT = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E";

function publicConfig() {
  return {
    cluster: process.env.SOLANA_CLUSTER || "mainnet-beta",
    rpcConfigured: Boolean(process.env.SOLANA_RPC_URL),
    feeWallet: process.env.PUBLIC_FEE_WALLET || "",
    contractAddress: process.env.PUBLIC_CONTRACT_ADDRESS || process.env.PUBLIC_TOKEN_MINT || "",
    tokenMint: process.env.PUBLIC_TOKEN_MINT || "",
    wbtcMint: process.env.PUBLIC_WBTC_MINT || DEFAULT_WBTC_MINT,
    distributorWallet: process.env.PUBLIC_DISTRIBUTOR_WALLET || "",
    holderIndexerUrlConfigured: Boolean(process.env.HOLDER_INDEXER_API_URL),
    solscanBaseUrl: process.env.PUBLIC_SOLSCAN_BASE_URL || "https://solscan.io",
    coingeckoApiUrl: process.env.PUBLIC_COINGECKO_API_URL || "https://api.coingecko.com/api/v3"
  };
}

async function rpc(method, params) {
  if (!process.env.SOLANA_RPC_URL) {
    throw new Error("SOLANA_RPC_URL is not configured");
  }

  const result = await fetch(process.env.SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "btc-pizza-day",
      method,
      params
    })
  });

  if (!result.ok) {
    throw new Error(`RPC request failed: ${result.status}`);
  }

  const body = await result.json();
  if (body.error) {
    throw new Error(body.error.message || "RPC returned an error");
  }
  return body.result;
}

function sendJson(response, status, body) {
  response.setHeader("cache-control", "no-store");
  response.status(status).json(body);
}

function requestUrl(request) {
  const host = request.headers.host || "localhost";
  return new URL(request.url || "/", `https://${host}`);
}

module.exports = {
  publicConfig,
  requestUrl,
  rpc,
  sendJson
};
