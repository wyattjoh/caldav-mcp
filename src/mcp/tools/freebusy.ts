import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CaldavClient } from "../../caldav/client";
import { formatError } from "../../util/errors";

export const QueryFreebusySchema = z.object({
  calendarUrls: z.array(z.url()).min(1).max(20),
  start: z.string(),
  end: z.string(),
});

export const registerFreebusyTools = (server: McpServer, caldav: CaldavClient): void => {
  server.registerTool(
    "caldav_query_freebusy",
    {
      title: "Query Free/Busy",
      description:
        "Return merged busy ranges for each calendar between `start` and `end`. Useful for availability checks before proposing a meeting time.",
      inputSchema: QueryFreebusySchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (args) => {
      try {
        const result = await caldav.queryFreebusy(args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error querying freebusy: ${formatError(error)}` }],
        };
      }
    },
  );
};
