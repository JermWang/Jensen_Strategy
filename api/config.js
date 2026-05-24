const { publicConfig, sendJson } = require("../lib/vercel-api");
const { readRecord } = require("../lib/admin-store");

module.exports = async function handler(_request, response) {
  const cfg = publicConfig();
  // After Go Live, automation.startedAt is the real distribution start time.
  // Without this, the public countdown stays blank because the env var is empty.
  if (!cfg.distributionStartedAt) {
    try {
      const automation = await readRecord("automation", "epoch-automation");
      if (automation?.startedAt) cfg.distributionStartedAt = automation.startedAt;
    } catch {
      // Non-fatal — serve config without the override if DB is unreachable.
    }
  }
  sendJson(response, 200, cfg);
};
