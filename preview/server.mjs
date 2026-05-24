import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const envRoot = dirname(root);
const env = await loadEnv();
Object.assign(process.env, env);
const require = createRequire(import.meta.url);
const { adminAuthError, adminStatus, isAdminAuthorized, runAdminAction, runScheduledEpoch } = require("../lib/admin-control.js");
const { feeReceipts, holderSnapshot, operationsSummary, publicConfig, tokenBalance } = require("../lib/dashboard-service.js");
const { readRecord } = require("../lib/admin-store.js");
const { cronSecretMatches } = require("../lib/secret-auth.js");
const { holdersPayload, receiptsPayload, statusPayload } = require("../lib/rewards/snapshotCache.js");
const { lookupWallet } = require("../lib/rewards/ticketLookup.js");
const port = Number(process.env.PORT || 4199);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

async function loadEnv() {
  const values = {};
  for (const file of [".env", ".env.local"]) {
    try {
      const text = await readFile(join(envRoot, file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        const [, key, raw] = match;
        values[key] = raw.replace(/^["']|["']$/g, "");
      }
    } catch {
      // Optional local env files are expected to be absent in fresh clones.
    }
  }
  return { ...values, ...process.env };
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function firstParam(params, names) {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return "";
}

function cronAuthorized(headers, searchParams) {
  if (isAdminAuthorized(headers)) return true;
  const authorization = headers.authorization || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return [bearer, headers["x-cron-secret"], firstParam(searchParams, ["secret", "cron_secret", "cronSecret", "token"])].some((candidate) =>
    cronSecretMatches(candidate)
  );
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);

  if (url.pathname === "/api/config") {
    const cfg = publicConfig(env);
    if (!cfg.distributionStartedAt) {
      const automation = await readRecord("automation", "epoch-automation").catch(() => null);
      if (automation?.startedAt) cfg.distributionStartedAt = automation.startedAt;
    }
    json(response, 200, cfg);
    return;
  }

  if (url.pathname === "/api/fee-receipts") {
    json(response, 200, await feeReceipts(env));
    return;
  }

  if (url.pathname === "/api/token-balance") {
    json(response, 200, await tokenBalance(url.searchParams.get("owner"), url.searchParams.get("mint"), env));
    return;
  }

  if (url.pathname === "/api/operations") {
    json(response, 200, await operationsSummary(env));
    return;
  }

  if (url.pathname === "/api/rewards/status") {
    response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
    json(response, 200, await statusPayload());
    return;
  }

  if (url.pathname === "/api/rewards/holders") {
    response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
    json(response, 200, await holdersPayload(url.searchParams.get("wallet") || ""));
    return;
  }

  if (url.pathname === "/api/rewards/receipts") {
    response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
    json(response, 200, await receiptsPayload());
    return;
  }

  if (url.pathname === "/api/rewards/wallet" || url.pathname.startsWith("/api/rewards/wallet/")) {
    response.setHeader("cache-control", "s-maxage=10, stale-while-revalidate=30");
    const wallet = url.searchParams.get("wallet") || decodeURIComponent(url.pathname.replace("/api/rewards/wallet/", ""));
    json(response, 200, await lookupWallet(wallet));
    return;
  }

  if (url.pathname === "/api/holders") {
    json(response, 200, await holderSnapshot(url.searchParams.get("wallet"), env));
    return;
  }

  if (url.pathname === "/api/admin") {
    if (!isAdminAuthorized(request.headers)) {
      json(response, 401, { ok: false, error: adminAuthError() });
      return;
    }

    try {
      if (request.method === "GET") {
        json(response, 200, await adminStatus());
        return;
      }

      if (request.method === "POST") {
        const body = await readJsonBody(request);
        const result = await runAdminAction(body.action, body);
        json(response, result.ok ? 200 : 502, result);
        return;
      }

      response.setHeader("allow", "GET, POST");
      json(response, 405, { ok: false, error: "Method not allowed." });
    } catch (error) {
      json(response, error.statusCode || 500, { ok: false, error: error.message || "Admin action failed." });
    }
    return;
  }

  if (url.pathname === "/api/epoch") {
    if (!cronAuthorized(request.headers, url.searchParams)) {
      json(response, 401, { ok: false, error: "Epoch cron authorization failed." });
      return;
    }

    try {
      if (!["GET", "POST"].includes(request.method || "GET")) {
        response.setHeader("allow", "GET, POST");
        json(response, 405, { ok: false, error: "Method not allowed." });
        return;
      }
      const body = request.method === "POST" ? await readJsonBody(request) : {};
      const result = await runScheduledEpoch({
        force: body.force === true || url.searchParams.get("force") === "true",
        source: body.source || "cron",
        payload: body.payload || {}
      });
      json(response, 200, { ok: true, action: "run-due-epoch", result });
    } catch (error) {
      json(response, error.statusCode || 500, { ok: false, error: error.message || "Epoch runner failed." });
    }
    return;
  }

  if (url.pathname === "/api/cron/epoch-tick") {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      json(response, 405, { ok: false, error: "Method not allowed." });
      return;
    }
    if (!cronAuthorized(request.headers, url.searchParams)) {
      json(response, 401, { ok: false, error: "Cron authorization failed." });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const result = await runScheduledEpoch({
        force: body.force === true,
        source: body.source || "cron-job.org",
        payload: body.payload || {}
      });
      json(response, 200, { ok: true, action: "run-due-epoch", result });
    } catch (error) {
      json(response, error.statusCode || 500, { ok: false, error: error.message || "Epoch runner failed." });
    }
    return;
  }

  const relativePath = url.pathname === "/" ? "index.html" : url.pathname === "/admin" ? "admin.html" : url.pathname.slice(1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": types[extname(filePath)] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Design preview running at http://localhost:${port}`);
});
