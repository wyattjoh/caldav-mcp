import { test, expect } from "bun:test";
import { createStubClient } from "../../../test/support/stub-client";
import { setupMcp, parseResponse } from "../../../test/support/mcp";

test("caldav_search_events returns events in range", async () => {
  const { client } = await setupMcp(
    createStubClient({
      async fetchEventsInRange() {
        return {
          events: [
            {
              uid: "e1",
              summary: "Meet",
              start: "2026-05-01T14:00:00.000Z",
              end: "2026-05-01T15:00:00.000Z",
              allDay: false,
              attendees: [],
              iCalendar: "",
            },
          ],
          etagByUrl: {
            "https://caldav.example.com/cal/default/e1.ics": 'W/"1"',
          },
          urlByUid: { e1: "https://caldav.example.com/cal/default/e1.ics" },
        };
      },
    }),
  );
  const result = await client.callTool({
    name: "caldav_search_events",
    arguments: {
      calendarUrl: "https://caldav.example.com/cal/default/",
      start: "2026-05-01T00:00:00Z",
      end: "2026-05-31T23:59:59Z",
    },
  });
  const parsed = parseResponse(result);
  expect(parsed.events).toHaveLength(1);
  expect(parsed.events[0].summary).toBe("Meet");
  expect(parsed.events[0].url).toBe("https://caldav.example.com/cal/default/e1.ics");
  expect(parsed.events[0].etag).toBe('W/"1"');
});

test("caldav_get_event returns full event including iCalendar", async () => {
  const { client } = await setupMcp(
    createStubClient({
      async getEvent() {
        return {
          event: {
            uid: "e1",
            summary: "Meet",
            start: "2026-05-01T14:00:00.000Z",
            end: "2026-05-01T15:00:00.000Z",
            allDay: false,
            attendees: [],
            iCalendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR",
          },
          etag: 'W/"1"',
        };
      },
    }),
  );
  const result = await client.callTool({
    name: "caldav_get_event",
    arguments: {
      calendarUrl: "https://caldav.example.com/cal/default/",
      eventUrl: "https://caldav.example.com/cal/default/e1.ics",
    },
  });
  const parsed = parseResponse(result);
  expect(parsed.event.uid).toBe("e1");
  expect(parsed.event.iCalendar).toContain("VCALENDAR");
  expect(parsed.etag).toBe('W/"1"');
});

test("caldav_create_event returns uid and etag", async () => {
  const { client } = await setupMcp(createStubClient());
  const result = await client.callTool({
    name: "caldav_create_event",
    arguments: {
      calendarUrl: "https://caldav.example.com/cal/default/",
      summary: "New",
      start: "2026-05-01T14:00:00Z",
      end: "2026-05-01T15:00:00Z",
    },
  });
  const parsed = parseResponse(result);
  expect(parsed.uid).toBe("new");
});

test("caldav_update_event requires etag", async () => {
  const { client } = await setupMcp(createStubClient());
  const result = await client.callTool({
    name: "caldav_update_event",
    arguments: {
      eventUrl: "https://caldav.example.com/cal/default/e1.ics",
      etag: 'W/"1"',
      patch: { summary: "Renamed" },
    },
  });
  const parsed = parseResponse(result);
  expect(parsed.etag).toBe('W/"2"');
});

test("caldav_delete_event returns { deleted: true }", async () => {
  const { client } = await setupMcp(createStubClient());
  const result = await client.callTool({
    name: "caldav_delete_event",
    arguments: { eventUrl: "https://caldav.example.com/cal/default/e1.ics" },
  });
  const parsed = parseResponse(result);
  expect(parsed.deleted).toBe(true);
});
