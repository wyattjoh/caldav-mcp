---
description: Unit and integration test conventions using bun:test
paths:
  - "test/**"
  - "**/*.test.ts"
alwaysApply: false
---

All tests use `bun:test`.

```ts
import { test, expect } from "bun:test";
```

Run:

```sh
bun test
```

### MCP tool tests

Follow the pattern from `../jmap-mcp/src/tools/email_test.ts`. Build an `McpServer`, register tools against a stubbed `CaldavClient`, pair it with a `Client` over `InMemoryTransport`, invoke the tool, parse `result.content[0].text` as JSON, assert.

### OAuth endpoint tests

Use Hono's `app.request(path, init)`. No sockets, no fetch. SQLite runs against a per-test `":memory:"` database via a helper in `test/support/db.ts`. Clock-dependent tests pass a `now()` function into the unit under test; never use `spyOn(Date, "now")`.

Avoid `mock.module()` — see Bun 1.x process-lifetime pollution caveat.
