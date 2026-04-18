# Changelog

## [0.1.5](https://github.com/wyattjoh/caldav-mcp/compare/caldav-mcp-v0.1.4...caldav-mcp-v0.1.5) (2026-04-18)


### Bug Fixes

* **http:** respond with 500 JSON on unhandled errors instead of HTML ([ab72296](https://github.com/wyattjoh/caldav-mcp/commit/ab72296e36195270dcbc466ba13db9dad8eff552))

## [0.1.4](https://github.com/wyattjoh/caldav-mcp/compare/caldav-mcp-v0.1.3...caldav-mcp-v0.1.4) (2026-04-18)


### Bug Fixes

* **pkg:** add keywords and explicit license for npm discoverability ([13f3e1f](https://github.com/wyattjoh/caldav-mcp/commit/13f3e1f1857b2d336709928f43ee989b5bff34f8))
* remove other command ([e7d385f](https://github.com/wyattjoh/caldav-mcp/commit/e7d385ff2da9ac607d2a37dbd0e48cb194ac2c53))

## [0.1.3](https://github.com/wyattjoh/caldav-mcp/compare/caldav-mcp-v0.1.2...caldav-mcp-v0.1.3) (2026-04-18)


### Bug Fixes

* **http:** mount MCP handler at / so Claude.ai root-path clients work ([02ebb8d](https://github.com/wyattjoh/caldav-mcp/commit/02ebb8d3d42c7ab3cdcac3b3f4d56bd176676580))

## [0.1.2](https://github.com/wyattjoh/caldav-mcp/compare/caldav-mcp-v0.1.1...caldav-mcp-v0.1.2) (2026-04-18)


### Features

* **http:** add request and error logging middleware ([5293a57](https://github.com/wyattjoh/caldav-mcp/commit/5293a576a8c3398b53b9f6c5e289736c7cf52d5e))

## [0.1.1](https://github.com/wyattjoh/caldav-mcp/compare/caldav-mcp-v0.1.0...caldav-mcp-v0.1.1) (2026-04-18)

### Bug Fixes

- **http:** trust single upstream proxy so rate limiter honours X-Forwarded-For ([d1f84fd](https://github.com/wyattjoh/caldav-mcp/commit/d1f84fdc24354f5910a6833605df3662c96d013d))

## 0.1.0 (2026-04-18)

### Features

- add --http flag to CLI entrypoint ([171017f](https://github.com/wyattjoh/caldav-mcp/commit/171017fb41f098bcbe6acce87337fb5931f2ed8f))
- **caldav:** add CaldavClient wrapper over tsdav ([f7accd3](https://github.com/wyattjoh/caldav-mcp/commit/f7accd37071ff2c2fb280c197a450a9b4704f0e0))
- **caldav:** add iCalendar build and parse helpers ([296145b](https://github.com/wyattjoh/caldav-mcp/commit/296145bd67319e6302a52eff1f400977f9e558ec))
- **config:** parse stdio and http env configs ([25f2b7b](https://github.com/wyattjoh/caldav-mcp/commit/25f2b7b08a68b167dfd5a5acaad7a5c06de03950))
- **db:** add AES-256-GCM secret encryption ([14540f0](https://github.com/wyattjoh/caldav-mcp/commit/14540f02ef8d1c2a29501536877ba493b629f3a6))
- **db:** add bun:sqlite with initial schema for SDK OAuth provider ([1ba8db4](https://github.com/wyattjoh/caldav-mcp/commit/1ba8db4711d62c2450c417f59f7c29c36ea9c197))
- **http:** wire Express app with MCP SDK auth router and bearer-gated /mcp ([289b1b0](https://github.com/wyattjoh/caldav-mcp/commit/289b1b0108703f503c98346dab33c668c748ada7))
- **mcp:** add caldav_list_calendars tool and test harness ([13e2758](https://github.com/wyattjoh/caldav-mcp/commit/13e27583f7a013df46fd4795f4bf93ff2c2f5c5f))
- **mcp:** add caldav_query_freebusy tool ([63babfe](https://github.com/wyattjoh/caldav-mcp/commit/63babfe7b8fd779fd8a7bbcc47787c0bd6c82c96))
- **mcp:** add event tools (search, get, create, update, delete) ([92179c7](https://github.com/wyattjoh/caldav-mcp/commit/92179c7323f908a5375a9a8afe550f5000384d86))
- **oauth:** add login page renderer and signed flow-state helper ([12cb5d1](https://github.com/wyattjoh/caldav-mcp/commit/12cb5d16fee8144072e66c0f1eb04253bf1f21e6))
- **oauth:** add MCP SDK OAuthServerProvider backed by SQLite ([b39db79](https://github.com/wyattjoh/caldav-mcp/commit/b39db790456003dbbbce5c5969d5d663ae3a4d4a))
- **oauth:** add sliding-window rate limiter ([38ecc60](https://github.com/wyattjoh/caldav-mcp/commit/38ecc60a5ff816662528a09d5fe173c1711e4de0))
- **oauth:** add SQLite helpers for the MCP SDK OAuth provider ([68f579c](https://github.com/wyattjoh/caldav-mcp/commit/68f579ce951b68191dadacba39b3a8022b305598))
- **util:** add formatError helper ([53069c3](https://github.com/wyattjoh/caldav-mcp/commit/53069c38913f43d5443645784a438c6db2240999))
- wire stdio transport and MCP server factory ([890290d](https://github.com/wyattjoh/caldav-mcp/commit/890290d549215eb6e1bde13422aa5d4becc887e1))

### Bug Fixes

- **caldav:** preserve TZID wall-clock time across build and parse ([a5fc5aa](https://github.com/wyattjoh/caldav-mcp/commit/a5fc5aa5cb93e20f4f622e2c7fb4f36358b999dd))
- **oauth:** include OAuth params as hidden fields in login form ([fc7a8d2](https://github.com/wyattjoh/caldav-mcp/commit/fc7a8d24b56a5cbb6429ab60e9ae5828ce52858c))
