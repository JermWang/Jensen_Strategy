function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 3));
  const baseMs = Math.max(50, Number(options.baseMs || 250));
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastError || new Error("Retry operation failed.");
}

module.exports = {
  withRetry
};
