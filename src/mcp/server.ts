import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CaldavClient } from "../caldav/client";
import { registerCalendarTools } from "./tools/calendars";
import { registerEventTools } from "./tools/events";
import { registerFreebusyTools } from "./tools/freebusy";
import pkg from "../../package.json" with { type: "json" };

export const createServer = (caldav: CaldavClient): McpServer => {
  const server = new McpServer({
    name: "caldav-mcp",
    version: (pkg as { version: string }).version,
  });
  registerCalendarTools(server, caldav);
  registerEventTools(server, caldav);
  registerFreebusyTools(server, caldav);
  return server;
};
