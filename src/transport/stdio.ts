import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseStdioConfig } from "../config";
import { createCaldavClient } from "../caldav/client";
import { createServer } from "../mcp/server";

export const runStdio = async (): Promise<void> => {
  const cfg = parseStdioConfig(process.env);
  const caldav = createCaldavClient({
    serverUrl: cfg.serverUrl,
    username: cfg.username,
    password: cfg.password,
  });
  const server = createServer(caldav);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.warn("caldav-mcp: stdio transport ready");
};
