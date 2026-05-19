const { publicConfig, rpc, sendJson } = require("../lib/vercel-api");

async function feeReceipts() {
  const config = publicConfig();
  if (!config.feeWallet) {
    return {
      configured: false,
      reason: "PUBLIC_FEE_WALLET is not configured",
      receipts: []
    };
  }

  const signatures = await rpc("getSignaturesForAddress", [
    config.feeWallet,
    { limit: Number(process.env.FEE_RECEIPT_LIMIT || 10) }
  ]);
  const lamports = await rpc("getBalance", [config.feeWallet]);

  return {
    configured: true,
    solBalance: lamports.value / 1_000_000_000,
    receipts: signatures.map((item) => ({
      signature: item.signature,
      slot: item.slot,
      blockTime: item.blockTime,
      status: item.err ? "failed" : "confirmed"
    }))
  };
}

module.exports = async function handler(_request, response) {
  try {
    sendJson(response, 200, await feeReceipts());
  } catch (error) {
    sendJson(response, 502, {
      configured: Boolean(process.env.SOLANA_RPC_URL),
      error: error.message,
      receipts: []
    });
  }
};
