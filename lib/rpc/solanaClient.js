const { rpcRequest, selectSolanaRpcUrl } = require("../solana-rpc");
const { withRetry } = require("./retry");

const circuit = {
  failureCount: 0,
  openUntil: 0,
  lastFailureAt: "",
  lastSuccessAt: ""
};

function circuitState() {
  return {
    open: circuit.openUntil > Date.now(),
    failureCount: circuit.failureCount,
    openUntil: circuit.openUntil ? new Date(circuit.openUntil).toISOString() : "",
    lastFailureAt: circuit.lastFailureAt,
    lastSuccessAt: circuit.lastSuccessAt
  };
}

function recordSuccess() {
  circuit.failureCount = 0;
  circuit.openUntil = 0;
  circuit.lastSuccessAt = new Date().toISOString();
}

function recordFailure(error, env = process.env) {
  circuit.failureCount += 1;
  circuit.lastFailureAt = new Date().toISOString();
  const threshold = Math.max(1, Number(env.SOLANA_RPC_CIRCUIT_THRESHOLD || 3));
  if (circuit.failureCount >= threshold) {
    circuit.openUntil = Date.now() + Math.max(1_000, Number(env.SOLANA_RPC_CIRCUIT_TTL_MS || 60_000));
  }
  return error;
}

async function solanaRpc(method, params = [], env = process.env, options = {}) {
  if (circuit.openUntil > Date.now()) {
    const error = new Error("RPC circuit is open.");
    error.code = "rpc_circuit_open";
    error.circuit = circuitState();
    throw error;
  }
  const started = Date.now();
  try {
    const result = await withRetry(() => rpcRequest(method, params, env, { timeoutMs: options.timeoutMs }), {
      attempts: options.attempts || 2,
      baseMs: options.baseMs || 250
    });
    recordSuccess();
    console.log(JSON.stringify({ scope: "solana_rpc", method, duration_ms: Date.now() - started, ok: true }));
    return result;
  } catch (error) {
    recordFailure(error, env);
    console.warn(JSON.stringify({ scope: "solana_rpc", method, duration_ms: Date.now() - started, ok: false, error: error.message }));
    throw error;
  }
}

async function selectedRpcUrl(env = process.env) {
  try {
    return await selectSolanaRpcUrl(env);
  } catch {
    return "";
  }
}

module.exports = {
  circuitState,
  selectedRpcUrl,
  solanaRpc
};
