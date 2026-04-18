---
description: iCalendar (RFC 5545) build/parse rules
paths:
  - "src/caldav/ical.ts"
  - "src/mcp/tools/events.ts"
alwaysApply: false
---

All VEVENT construction goes through `buildVEvent(...)` in `src/caldav/ical.ts`. All VEVENT parsing goes through `parseVEvent(...)` in the same file.

Invariants:

- `UID` is generated as `${crypto.randomUUID()}@caldav-mcp.local` on create; callers never supply it.
- `DTSTAMP` is always set to the current UTC time when building.
- Default timezone is UTC (`DTSTART:YYYYMMDDTHHMMSSZ`). When a caller supplies a tz, emit `DTSTART;TZID=<tz>:YYYYMMDDTHHMMSS` and include a matching `VTIMEZONE` only if we have a cached one (initial version emits floating + TZID without VTIMEZONE; Fastmail accepts this).
- Text fields (`SUMMARY`, `DESCRIPTION`, `LOCATION`) are escaped per RFC 5545 section 3.3.11: `\` to `\\`, `,` to `\,`, `;` to `\;`, newline to `\n`.
- Lines are folded at 75 octets using CRLF + space continuation.
- Parsers unfold before splitting on `:` / `;`.
