import { test, expect } from "bun:test";
import { createStubClient } from "../../../test/support/stub-client";
import { setupMcp, parseResponse } from "../../../test/support/mcp";

test("caldav_query_freebusy returns busy ranges per calendar", async () => {
  const { client } = await setupMcp(
    createStubClient({
      async queryFreebusy({ calendarUrls }) {
        return {
          results: calendarUrls.map((url) => ({
            calendarUrl: url,
            busy: [{ start: "2026-05-01T14:00:00.000Z", end: "2026-05-01T15:00:00.000Z" }],
          })),
        };
      },
    }),
  );
  const result = await client.callTool({
    name: "caldav_query_freebusy",
    arguments: {
      calendarUrls: ["https://caldav.example.com/cal/default/"],
      start: "2026-05-01T00:00:00Z",
      end: "2026-05-02T00:00:00Z",
    },
  });
  const parsed = parseResponse(result);
  expect(parsed.results).toHaveLength(1);
  expect(parsed.results[0].busy).toHaveLength(1);
});
