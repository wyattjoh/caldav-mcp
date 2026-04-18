# @wyattjoh/caldav-mcp

MCP server exposing a CalDAV calendar (Fastmail-tested) over stdio and HTTP. The HTTP transport is a self-hosted OAuth 2.1 authorization server usable as a Claude.ai custom connector.

## Tools

| Tool                    | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `caldav_list_calendars` | Discover calendars and their `url`s.          |
| `caldav_search_events`  | Fetch events in an ISO 8601 range.            |
| `caldav_get_event`      | Fetch a single event including raw iCalendar. |
| `caldav_create_event`   | Create a VEVENT.                              |
| `caldav_update_event`   | Update an event with ETag-based concurrency.  |
| `caldav_delete_event`   | Delete an event.                              |
| `caldav_query_freebusy` | Busy intervals across calendars.              |

## Stdio install

```sh
npm install -g @wyattjoh/caldav-mcp
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "caldav": {
      "command": "op",
      "args": ["run", "--", "caldav-mcp"],
      "env": {
        "CALDAV_SERVER_URL": "https://caldav.fastmail.com/",
        "CALDAV_USERNAME": "op://Personal/Fastmail CalDAV/username",
        "CALDAV_APP_PASSWORD": "op://Personal/Fastmail CalDAV/password"
      }
    }
  }
}
```

## HTTP (Claude.ai custom connector)

Run the Docker image with `/data` mounted:

```sh
docker run -d \
  -p 3000:3000 \
  -v caldav-mcp-data:/data \
  -e CALDAV_MCP_PUBLIC_URL=https://caldav-mcp.example.com \
  -e CALDAV_MCP_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  ghcr.io/wyattjoh/caldav-mcp:latest
```

Add it as a custom connector in Claude.ai with `Remote MCP server URL` set to the public URL. Leave `OAuth Client ID` blank to use Dynamic Client Registration.

## Environment variables

See `docs/superpowers/specs/2026-04-17-caldav-mcp-design.md` for the full reference.

## Development

```sh
bun install
bun run start            # stdio
bun run start:http       # http on 3000
bun run check            # lint + fmt + typecheck
bun test
```

## License

MIT
