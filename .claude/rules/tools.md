---
description: MCP tool authoring conventions — Zod schemas, response envelope, error handling
paths:
  - "src/mcp/tools/**"
alwaysApply: false
---

Every MCP tool:

1. Defines its input as a top-level `const <Name>Schema = z.object({ ... })`, exported from the same file as the tool registration.
2. Uses `server.registerTool(name, { title, description, inputSchema: Schema.shape, annotations }, async (args) => {...})`.
3. Returns `{ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] }`.
4. Wraps the handler body in `try { ... } catch (error) { return { content: [{ type: "text", text: `Error <verb>: ${formatError(error)}` }] } }`. **Never throw out of a tool handler** — the transport swallows the context.
5. Imports the CalDAV client from `src/caldav/client.ts` only. Never imports `tsdav` directly; see `.claude/rules/caldav.md`.
6. Uses `annotations.readOnlyHint: true` for fetch-only tools and `annotations.destructiveHint: true` for `delete_event`.

The canonical tool response shape is copied from `../jmap-mcp/src/tools/email.ts`. New tools follow that file's structure.
