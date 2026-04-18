---
description: CalDAV client boundary — all DAV I/O goes through src/caldav/client.ts
paths:
  - "src/caldav/**"
  - "src/mcp/tools/**"
alwaysApply: false
---

The `tsdav` import surface is confined to `src/caldav/client.ts`. Tool handlers import only `CaldavClient` and its methods from that module. This keeps vendor details swappable and makes tools testable with a stub client that implements the same methods.

`CaldavClient` exposes only the methods the tools need:

- `listCalendars(opts)`
- `fetchEventsInRange({ calendarUrl, start, end, expand })`
- `getEvent({ calendarUrl, eventUrl })`
- `createEvent({ calendarUrl, iCalString, filename })`
- `updateEvent({ eventUrl, iCalString, etag })`
- `deleteEvent({ eventUrl, etag })`
- `queryFreebusy({ calendarUrls, start, end })`

New CalDAV features get a method on this interface. If a tool needs something that is not on the interface, add the method — do not reach around it.
