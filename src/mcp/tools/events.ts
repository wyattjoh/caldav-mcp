import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CaldavClient } from "../../caldav/client";
import { formatError } from "../../util/errors";

export const SearchEventsSchema = z.object({
  calendarUrl: z.url(),
  start: z.string().describe("ISO 8601 start of range"),
  end: z.string().describe("ISO 8601 end of range"),
  expandRecurring: z.boolean().default(true),
  limit: z.number().int().min(1).max(1000).default(100),
});

export const GetEventSchema = z.object({
  calendarUrl: z.url(),
  eventUrl: z.url(),
});

export const AttendeeSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
  role: z.enum(["CHAIR", "REQ-PARTICIPANT", "OPT-PARTICIPANT", "NON-PARTICIPANT"]).optional(),
});

export const CreateEventSchema = z.object({
  calendarUrl: z.url(),
  summary: z.string().min(1),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendees: z.array(AttendeeSchema).optional(),
  rrule: z.string().optional(),
  timezone: z.string().optional(),
});

export const UpdateEventPatchSchema = z.object({
  summary: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendees: z.array(AttendeeSchema).optional(),
  rrule: z.string().optional(),
  timezone: z.string().optional(),
  calendarUrl: z.url().optional(),
});

export const UpdateEventSchema = z.object({
  eventUrl: z.url(),
  etag: z.string().min(1),
  patch: UpdateEventPatchSchema,
});

export const DeleteEventSchema = z.object({
  eventUrl: z.url(),
  etag: z.string().optional(),
});

export const registerEventTools = (server: McpServer, caldav: CaldavClient): void => {
  server.registerTool(
    "caldav_search_events",
    {
      title: "Search Events",
      description:
        "Fetch events between `start` and `end` (ISO 8601). Set `expandRecurring` to false to return recurrence masters with RRULEs instead of expanded occurrences. Each returned event includes `url` and `etag` required by `caldav_update_event` and `caldav_delete_event`.",
      inputSchema: SearchEventsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        const { events, etagByUrl, urlByUid } = await caldav.fetchEventsInRange({
          calendarUrl: args.calendarUrl,
          start: args.start,
          end: args.end,
          expand: args.expandRecurring,
        });
        const enriched = events.slice(0, args.limit).map((e) => {
          const url = urlByUid[e.uid];
          return { ...e, url, etag: url ? (etagByUrl[url] ?? "") : "" };
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ events: enriched }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error searching events: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "caldav_get_event",
    {
      title: "Get Event",
      description:
        "Fetch a single event by its CalDAV URL. Returns parsed fields plus the raw iCalendar text and the current ETag for use with update/delete.",
      inputSchema: GetEventSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        const { event, etag } = await caldav.getEvent(args);
        return {
          content: [{ type: "text", text: JSON.stringify({ event, etag }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting event: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "caldav_create_event",
    {
      title: "Create Event",
      description:
        "Create a new VEVENT on the given calendar. Returns the generated UID, the CalDAV URL of the new object, and the server-assigned ETag.",
      inputSchema: CreateEventSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        const { calendarUrl, ...rest } = args;
        const created = await caldav.createEvent({ calendarUrl, ...rest });
        return {
          content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating event: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "caldav_update_event",
    {
      title: "Update Event",
      description:
        "Update an existing event by URL. Requires the current ETag for concurrency control; a 412 indicates a conflicting modification and the caller should re-fetch.",
      inputSchema: UpdateEventSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        const updated = await caldav.updateEvent({
          eventUrl: args.eventUrl,
          etag: args.etag,
          patch: args.patch,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating event: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "caldav_delete_event",
    {
      title: "Delete Event",
      description:
        "Delete an event by URL. Optionally pass the current ETag for safe deletion (server returns 412 if the event was modified since).",
      inputSchema: DeleteEventSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) => {
      try {
        await caldav.deleteEvent(args);
        return {
          content: [{ type: "text", text: JSON.stringify({ deleted: true }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting event: ${formatError(error)}`,
            },
          ],
        };
      }
    },
  );
};
