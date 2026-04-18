import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CaldavClient } from "../../src/caldav/client";
import { registerCalendarTools } from "../../src/mcp/tools/calendars";

export const setupMcp = async (caldav: CaldavClient) => {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerCalendarTools(server, caldav);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { server, client };
};

export const parseResponse = (result: unknown) =>
  JSON.parse((result as { content: { text: string }[] }).content[0].text);
