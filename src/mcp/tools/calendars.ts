import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CaldavClient } from "../../caldav/client";
import { formatError } from "../../util/errors";

export const ListCalendarsSchema = z.object({
  includeReadOnly: z.boolean().default(true).describe("Include calendars the user cannot write to"),
});

export const registerCalendarTools = (server: McpServer, caldav: CaldavClient): void => {
  server.registerTool(
    "caldav_list_calendars",
    {
      title: "List Calendars",
      description:
        "List calendars accessible to the configured CalDAV account. Call this first to discover `calendarUrl` values for other tools. Returns display names, colors, ctags, and read-only flags.",
      inputSchema: ListCalendarsSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        const all = await caldav.listCalendars({ includeReadOnly: args.includeReadOnly });
        const calendars = args.includeReadOnly ? all : all.filter((c) => !c.readOnly);
        return {
          content: [{ type: "text", text: JSON.stringify({ calendars }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing calendars: ${formatError(error)}` }],
        };
      }
    },
  );
};
