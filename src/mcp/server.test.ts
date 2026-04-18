import { test, expect } from "bun:test";
import { createStubClient } from "../../test/support/stub-client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server";

test("createServer registers all seven caldav_ tools", async () => {
  const server = createServer(createStubClient());
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  expect(names).toEqual(
    [
      "caldav_create_event",
      "caldav_delete_event",
      "caldav_get_event",
      "caldav_list_calendars",
      "caldav_query_freebusy",
      "caldav_search_events",
      "caldav_update_event",
    ].sort(),
  );
});
