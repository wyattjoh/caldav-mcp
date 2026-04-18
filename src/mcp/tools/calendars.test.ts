import { test, expect } from "bun:test";
import { createStubClient } from "../../../test/support/stub-client";
import { setupMcp, parseResponse } from "../../../test/support/mcp";

test("caldav_list_calendars returns calendar list", async () => {
  const { client } = await setupMcp(createStubClient());
  const result = await client.callTool({ name: "caldav_list_calendars", arguments: {} });
  const parsed = parseResponse(result);
  expect(parsed.calendars).toHaveLength(1);
  expect(parsed.calendars[0].displayName).toBe("Default");
});

test("caldav_list_calendars filters read-only when requested", async () => {
  const { client } = await setupMcp(
    createStubClient({
      async listCalendars() {
        return [
          { url: "a", displayName: "A", components: ["VEVENT"], readOnly: false },
          { url: "b", displayName: "B", components: ["VEVENT"], readOnly: true },
        ];
      },
    }),
  );
  const result = await client.callTool({
    name: "caldav_list_calendars",
    arguments: { includeReadOnly: false },
  });
  const parsed = parseResponse(result);
  expect(parsed.calendars).toHaveLength(1);
  expect(parsed.calendars[0].displayName).toBe("A");
});
