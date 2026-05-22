const DEFAULT_WBTC_MINT = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E";
const DEFAULT_WSOL_MINT = "So11111111111111111111111111111111111111112";
const { buildDistributionPolicy, currentDistributionEpoch, distributionPreview } = require("./distribution-policy");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function publicConfig() {
  const devCreatorWallet = process.env.DEV_CREATOR_WALLET || "";
  const distributionPolicy = buildDistributionPolicy(process.env);
  const distributionEpoch = currentDistributionEpoch(distributionPolicy);
  const distributionSchedule = distributionPreview(distributionPolicy);
  return {
    cluster: process.env.SOLANA_CLUSTER || "mainnet-beta",
    rpcConfigured: Boolean(process.env.SOLANA_RPC_URL),
    devCreatorWallet,
    feeWallet: process.env.PUBLIC_FEE_WALLET || devCreatorWallet,
    contractAddress: process.env.PUBLIC_CONTRACT_ADDRESS || process.env.PUBLIC_TOKEN_MINT || "",
    tokenMint: process.env.PUBLIC_TOKEN_MINT || "",
    wbtcMint: process.env.PUBLIC_WBTC_MINT || DEFAULT_WBTC_MINT,
    wsolMint: process.env.PUBLIC_WSOL_MINT || DEFAULT_WSOL_MINT,
    distributorWallet: process.env.PUBLIC_DISTRIBUTOR_WALLET || devCreatorWallet,
    jupiterConfigured: Boolean(process.env.JUPITER_API_BASE_URL || process.env.JUPITER_API_KEY || true),
    jupiterApiBaseUrl: process.env.JUPITER_API_BASE_URL || "https://api.jup.ag/swap/v1",
    jupiterSwapUserPublicKey: process.env.JUPITER_SWAP_USER_PUBLIC_KEY || devCreatorWallet,
    creatorFeeClaimPublicKey: process.env.CREATOR_PUBLIC_KEY || devCreatorWallet,
    pumpPortalLocalApiUrl: process.env.PUMPPORTAL_LOCAL_API_URL || "https://pumpportal.fun/api/trade-local",
    holderIndexerUrlConfigured: Boolean(process.env.HOLDER_INDEXER_API_URL),
    distributionStartedAt: distributionPolicy.startedAt,
    distributionMode: distributionPolicy.mode,
    distributionBaseIntervalSeconds: distributionPolicy.baseIntervalSeconds,
    distributionIntervalMultiplier: distributionPolicy.intervalMultiplier,
    distributionBaseHolderCap: distributionPolicy.baseHolderCap,
    distributionHolderCapMultiplier: distributionPolicy.holderCapMultiplier,
    distributionPreviewEpochs: distributionPolicy.previewEpochs,
    distributionScheduleSeconds: distributionSchedule.map((step) => step.seconds),
    distributionScheduleLabels: distributionSchedule.map((step) => step.label),
    distributionHolderCaps: distributionSchedule.map((step) => step.holderCap),
    currentDistributionEpoch: distributionEpoch,
    distributionIntervalSeconds: distributionEpoch.seconds,
    distributionIntervalLabel: distributionEpoch.label,
    distributionRoundCap: distributionEpoch.holderCap,
    solscanBaseUrl: process.env.PUBLIC_SOLSCAN_BASE_URL || "https://solscan.io",
    coingeckoApiUrl: process.env.PUBLIC_COINGECKO_API_URL || "https://api.coingecko.com/api/v3"
  };
}

async function rpc(method, params) {
  if (!process.env.SOLANA_RPC_URL) {
    throw new Error("SOLANA_RPC_URL is not configured");
  }

  const retryCount = Number(process.env.SOLANA_RPC_RETRY_COUNT || 4);
  const retryBaseMs = Number(process.env.SOLANA_RPC_RETRY_BASE_MS || 650);
  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
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
        const retryAfter = Number(result.headers.get("retry-after"));
        const retryable = result.status === 429 || result.status >= 500;
        if (retryable && attempt < retryCount) {
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : retryBaseMs * 2 ** attempt;
          await sleep(delay);
          continue;
        }
        const error = new Error(`RPC request failed: ${result.status}`);
        error.retryable = retryable;
        throw error;
      }

      const body = await result.json();
      if (body.error) {
        const retryable = body.error.code === 429 || body.error.code === -32005;
        if (retryable && attempt < retryCount) {
          await sleep(retryBaseMs * 2 ** attempt);
          continue;
        }
        const error = new Error(body.error.message || "RPC returned an error");
        error.retryable = retryable;
        throw error;
      }
      return body.result;
    } catch (error) {
      lastError = error;
      if (error?.retryable === false) throw error;
      if (attempt >= retryCount) break;
      await sleep(retryBaseMs * 2 ** attempt);
    }
  }

  throw lastError || new Error("RPC request failed");
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
