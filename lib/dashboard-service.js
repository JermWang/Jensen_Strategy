const { buildDistributionPolicy, currentDistributionEpoch, distributionPreview } = require("./distribution-policy");
const { fetchHolderSnapshot, parseWalletList, toDashboardSnapshot } = require("./rpc-holders");
const { tokenBalanceForOwner } = require("./token-utils");

const DEFAULT_PROJECT_TOKEN_MINT = "ATyQWLEfSgBR3Fepj8D1k8RdyxERagnFiwsyMvbpump";
const DEFAULT_PROJECT_WALLET = "6fPPxdyfwqvJSvn9dqa8x7TeFd7P8yQPeUWSQSBbLVvE";
const DEFAULT_WBTC_MINT = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E";
const DEFAULT_WSOL_MINT = "So11111111111111111111111111111111111111112";

function envValue(env, key, fallback = "") {
  return env[key] || fallback;
}

function solanaRpcUrl(env = process.env) {
  if (env.SOLANA_RPC_URL) return env.SOLANA_RPC_URL;
  if (env.HELIUS_RPC_URL) return env.HELIUS_RPC_URL;
  if (env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`;
  return "";
}

function publicConfig(env = process.env) {
  const devCreatorWallet = envValue(env, "DEV_CREATOR_WALLET", DEFAULT_PROJECT_WALLET);
  const tokenMint = envValue(env, "PUBLIC_TOKEN_MINT", DEFAULT_PROJECT_TOKEN_MINT);
  const distributionPolicy = buildDistributionPolicy(env);
  const distributionEpoch = currentDistributionEpoch(distributionPolicy);
  const distributionSchedule = distributionPreview(distributionPolicy);
  const holderIndexerUrlConfigured = Boolean(env.HOLDER_INDEXER_API_URL);

  return {
    cluster: env.SOLANA_CLUSTER || "mainnet-beta",
    rpcConfigured: Boolean(solanaRpcUrl(env)),
    devCreatorWallet,
    feeWallet: envValue(env, "PUBLIC_FEE_WALLET", devCreatorWallet),
    contractAddress: envValue(env, "PUBLIC_CONTRACT_ADDRESS", tokenMint),
    tokenMint,
    wbtcMint: envValue(env, "PUBLIC_WBTC_MINT", DEFAULT_WBTC_MINT),
    wsolMint: envValue(env, "PUBLIC_WSOL_MINT", DEFAULT_WSOL_MINT),
    distributorWallet: envValue(env, "PUBLIC_DISTRIBUTOR_WALLET", devCreatorWallet),
    jupiterConfigured: Boolean(env.JUPITER_API_BASE_URL || env.JUPITER_API_KEY || true),
    jupiterApiBaseUrl: env.JUPITER_API_BASE_URL || "https://api.jup.ag/swap/v1",
    jupiterSwapUserPublicKey: envValue(env, "JUPITER_SWAP_USER_PUBLIC_KEY", devCreatorWallet),
    creatorFeeClaimPublicKey: envValue(env, "CREATOR_PUBLIC_KEY", devCreatorWallet),
    pumpPortalLocalApiUrl: env.PUMPPORTAL_LOCAL_API_URL || "https://pumpportal.fun/api/trade-local",
    holderIndexerUrlConfigured,
    holderSnapshotProvider: env.HOLDER_SNAPSHOT_PROVIDER || "solana-rpc",
    holderDataMode: holderIndexerUrlConfigured ? "live-indexer" : env.HOLDER_SNAPSHOT_PROVIDER || "solana-rpc",
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
    solscanBaseUrl: env.PUBLIC_SOLSCAN_BASE_URL || "https://solscan.io",
    coingeckoApiUrl: env.PUBLIC_COINGECKO_API_URL || "https://api.coingecko.com/api/v3"
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpc(method, params, env = process.env) {
  const url = solanaRpcUrl(env);
  if (!url) {
    throw new Error("SOLANA_RPC_URL or HELIUS_RPC_URL is not configured");
  }

  const retryCount = Number(env.SOLANA_RPC_RETRY_COUNT || 4);
  const retryBaseMs = Number(env.SOLANA_RPC_RETRY_BASE_MS || 650);
  let lastError;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const result = await fetch(url, {
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

function launchSafeStatus(status, reason, extra = {}) {
  return {
    configured: false,
    status,
    reason,
    live: false,
    ...extra
  };
}

async function feeReceipts(env = process.env) {
  const config = publicConfig(env);
  if (!config.feeWallet) {
    return launchSafeStatus("awaiting_fee_wallet", "Fee wallet is not configured yet.", { receipts: [] });
  }

  if (!solanaRpcUrl(env)) {
    return launchSafeStatus("awaiting_rpc", "Fee wallet is set; live receipt polling starts when SOLANA_RPC_URL or HELIUS_RPC_URL is configured.", {
      feeWallet: config.feeWallet,
      receipts: []
    });
  }

  try {
    const rpcForEnv = (method, params) => rpc(method, params, env);
    const [signatures, lamports, wsol] = await Promise.all([
      rpcForEnv("getSignaturesForAddress", [config.feeWallet, { limit: Number(env.FEE_RECEIPT_LIMIT || 10) }]),
      rpcForEnv("getBalance", [config.feeWallet]),
      tokenBalanceForOwner({ rpc: rpcForEnv, owner: config.feeWallet, mint: config.wsolMint })
    ]);

    return {
      configured: true,
      status: "live",
      live: true,
      feeWallet: config.feeWallet,
      solBalance: lamports.value / 1_000_000_000,
      wsolBalance: wsol.balance,
      totalSolAndWsolBalance: lamports.value / 1_000_000_000 + wsol.balance,
      wsolAccountCount: wsol.accountCount,
      receipts: signatures.map((item) => ({
        signature: item.signature,
        slot: item.slot,
        blockTime: item.blockTime,
        status: item.err ? "failed" : "confirmed"
      }))
    };
  } catch (error) {
    return launchSafeStatus("temporarily_unavailable", "Fee wallet is configured, but live Solana receipts are temporarily unavailable.", {
      feeWallet: config.feeWallet,
      error: error.message,
      receipts: []
    });
  }
}

async function tokenBalance(owner, mint, env = process.env) {
  if (!owner || !mint) {
    return launchSafeStatus("awaiting_addresses", "Token balance needs an owner and mint.", {
      owner: owner || "",
      mint: mint || "",
      accountCount: 0,
      balance: null
    });
  }

  if (!solanaRpcUrl(env)) {
    return launchSafeStatus("awaiting_rpc", "Token balance polling starts when SOLANA_RPC_URL or HELIUS_RPC_URL is configured.", {
      owner,
      mint,
      accountCount: 0,
      balance: null
    });
  }

  try {
    return await tokenBalanceForOwner({ rpc: (method, params) => rpc(method, params, env), owner, mint });
  } catch (error) {
    return launchSafeStatus("temporarily_unavailable", "Token balance is configured, but live Solana polling is temporarily unavailable.", {
      owner,
      mint,
      error: error.message,
      accountCount: 0,
      balance: null
    });
  }
}

function decorateIndexerSnapshot(body) {
  return {
    ...body,
    configured: body.configured !== false,
    live: body.live !== false,
    fallback: false,
    source: body.source || "holder-indexer",
    sourceLabel: body.sourceLabel || "Live holder indexer",
    status: body.status || "live"
  };
}

async function fetchIndexerSnapshot(wallet, env = process.env) {
  const url = new URL(env.HOLDER_INDEXER_API_URL);
  if (wallet) url.searchParams.set("wallet", wallet);
  const result = await fetch(url, { headers: { accept: "application/json" } });
  const body = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(body.error || body.message || `Holder indexer failed: ${result.status}`);
  }
  return decorateIndexerSnapshot(body);
}

async function fetchConfiguredProviderSnapshot(wallet, env = process.env) {
  const config = publicConfig(env);
  const provider = env.HOLDER_SNAPSHOT_PROVIDER || "solana-rpc";
  const canUseProvider = ["solana-rpc", "helius", "auto"].includes(provider) || env.ENABLE_RPC_HOLDER_FALLBACK === "true";
  if (!canUseProvider || !solanaRpcUrl(env)) return null;

  const excludedWallets = [
    ...parseWalletList(env.HOLDER_EXCLUDED_WALLETS || ""),
    config.feeWallet,
    config.distributorWallet
  ].filter(Boolean);
  const snapshot = await fetchHolderSnapshot({
    tokenMint: config.tokenMint,
    rpc: (method, params) => rpc(method, params, env),
    minBalanceUi: Number(env.HOLDER_SNAPSHOT_MIN_BALANCE || 0),
    excludedWallets
  });

  const roundCap = currentDistributionEpoch(buildDistributionPolicy(env)).holderCap;
  return toDashboardSnapshot(snapshot, wallet || "", roundCap);
}

async function holderSnapshot(wallet = "", env = process.env) {
  let fallbackReason = "";

  if (env.HOLDER_INDEXER_API_URL) {
    try {
      return await fetchIndexerSnapshot(wallet, env);
    } catch (error) {
      fallbackReason = error.message;
    }
  }

  try {
    const providerSnapshot = await fetchConfiguredProviderSnapshot(wallet, env);
    if (providerSnapshot) return providerSnapshot;
  } catch (error) {
    fallbackReason = fallbackReason || error.message;
  }

  return launchSafeStatus("holder_snapshot_unavailable", "No live holder source is available. Configure HOLDER_SNAPSHOT_PROVIDER=solana-rpc, helius, auto, or HOLDER_INDEXER_API_URL.", {
    error: fallbackReason,
    wallet: wallet || "",
    current: null,
    holders: []
  });
}

module.exports = {
  feeReceipts,
  holderSnapshot,
  publicConfig,
  rpc,
  solanaRpcUrl,
  tokenBalance
};
