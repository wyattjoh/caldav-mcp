#!/usr/bin/env node
import { runStdio } from "./transport/stdio";
import { parseHttpConfig } from "./config";
import { buildHttpApp } from "./transport/http";

const args = process.argv.slice(2);
const isHttp = args.includes("--http");
const portIdx = args.indexOf("--port");
const portOverride = portIdx !== -1 ? Number(args[portIdx + 1]) : undefined;

if (isHttp) {
  const cfg = parseHttpConfig(process.env);
  const { app } = buildHttpApp({
    publicUrl: cfg.publicUrl,
    defaultServerUrl: cfg.defaultServerUrl,
    encryptionKey: cfg.encryptionKey,
    allowedUsernames: cfg.allowedUsernames,
    dbPath: cfg.dbPath,
  });
  const port = portOverride ?? cfg.port;
  app.listen(port, cfg.host, () => {
    console.warn(`caldav-mcp: http transport ready on ${cfg.host}:${port}`);
  });
} else {
  await runStdio();
}
