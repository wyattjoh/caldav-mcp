import express from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomBytes } from "node:crypto";
import type { Database } from "bun:sqlite";
import { createDb } from "../db/index";
import * as store from "../oauth/db";
import { createProvider, type VerifyLogin } from "../oauth/provider";
import { createRateLimiter } from "../oauth/rate-limit";
import { createServer } from "../mcp/server";
import { createCaldavClient } from "../caldav/client";
import { errorLogger, requestLogger } from "../util/log";

export type HttpAppOptions = {
  publicUrl: string;
  defaultServerUrl: string;
  encryptionKey: Uint8Array;
  allowedUsernames: string[];
  dbPath: string;
  verifyLogin?: VerifyLogin;
};

export type HttpApp = {
  app: express.Express;
  db: Database;
};

export const buildHttpApp = (opts: HttpAppOptions): HttpApp => {
  const db = createDb(opts.dbPath);
  const flowKey = new Uint8Array(randomBytes(32));

  const verifyLogin: VerifyLogin =
    opts.verifyLogin ??
    (async ({ serverUrl, username, password }) => {
      const probe = createCaldavClient({ serverUrl, username, password });
      await probe.listCalendars();
    });

  const provider = createProvider({
    db,
    encryptionKey: opts.encryptionKey,
    flowKey,
    defaultServerUrl: opts.defaultServerUrl,
    allowedUsernames: opts.allowedUsernames,
    verifyLogin,
    rateLimiter: createRateLimiter({ limit: 5, windowMs: 15 * 60_000 }),
  });

  const app = express();
  app.set("trust proxy", 1);
  app.use(requestLogger());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: new URL(opts.publicUrl),
      baseUrl: new URL(opts.publicUrl),
      serviceDocumentationUrl: new URL(opts.publicUrl + "/"),
    }),
  );

  const bearer = requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: `${opts.publicUrl}/.well-known/oauth-protected-resource`,
  });

  app.post("/mcp", bearer, async (req, res) => {
    const accountId = req.auth?.extra?.accountId;
    if (typeof accountId !== "string" || !accountId) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const account = store.loadAccount(db, opts.encryptionKey, accountId);
    if (!account) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const caldav = createCaldavClient({
      serverUrl: account.serverUrl,
      username: account.username,
      password: account.password,
    });

    const mcp = createServer(caldav);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(errorLogger());

  const sweep = setInterval(() => store.sweepExpired(db), 5 * 60_000);
  sweep.unref();

  return { app, db };
};
