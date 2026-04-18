# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

`@wyattjoh/caldav-mcp` is a Bun-based Model Context Protocol (MCP) server that exposes a CalDAV calendar account (Fastmail-tested) over stdio and HTTP. The HTTP transport is a self-hosted OAuth 2.1 authorization server usable as a Claude.ai custom connector.

See `docs/superpowers/specs/2026-04-17-caldav-mcp-design.md` for full design.

## Commands

```sh
bun install
bun run start              # stdio transport
bun run start:http         # HTTP transport on port 3000
bun run build              # transpile to dist/
bun run check              # lint + fmt + typecheck
bun run test               # bun:test suite
```

## Conformance rules

Per-domain conventions live in `.claude/rules/`:

- `tools.md`, `oauth.md`, `caldav.md`, `ical.md` — domain-specific authoring rules
- `testing.md`, `logging.md`, `errors.md`, `db.md` — cross-cutting concerns
- `commits.md` — conventional commits

When editing files in a rule's `paths` scope, follow that rule.

## Architecture

- `src/index.ts` dispatches on `--http` to `transport/stdio.ts` or `transport/http.ts`.
- Tools live in `src/mcp/tools/`. All CalDAV I/O flows through `src/caldav/client.ts`.
- OAuth 2.1 endpoints live in `src/oauth/`. State persists in `bun:sqlite` via `src/db/`.
- Tests are in `test/` and in `*.test.ts` files next to the unit under test. All use `bun:test`.
