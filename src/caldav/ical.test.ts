import { test, expect } from "bun:test";
import { buildVEvent, parseVEvent, foldLine, escapeText } from "./ical";

test("escapeText escapes RFC 5545 special characters", () => {
  expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
});

test("foldLine wraps at 75 octets with CRLF + space", () => {
  const long = "A".repeat(80);
  const folded = foldLine(long);
  expect(folded.split("\r\n ").join("").length).toBe(80);
  expect(folded.split("\r\n ")[0]).toHaveLength(75);
});

test("buildVEvent emits required fields and escapes summary", () => {
  const ical = buildVEvent({
    summary: "Meet, talk; plan",
    start: "2026-05-01T14:00:00Z",
    end: "2026-05-01T15:00:00Z",
  });
  expect(ical).toContain("BEGIN:VCALENDAR");
  expect(ical).toContain("BEGIN:VEVENT");
  expect(ical).toContain("END:VEVENT");
  expect(ical).toContain("END:VCALENDAR");
  expect(ical).toMatch(/UID:[^@]+@caldav-mcp\.local/);
  expect(ical).toContain("DTSTART:20260501T140000Z");
  expect(ical).toContain("DTEND:20260501T150000Z");
  expect(ical).toContain("SUMMARY:Meet\\, talk\\; plan");
  expect(ical).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
});

test("buildVEvent emits all-day event with DATE values", () => {
  const ical = buildVEvent({
    summary: "Holiday",
    start: "2026-05-01",
    end: "2026-05-02",
    allDay: true,
  });
  expect(ical).toContain("DTSTART;VALUE=DATE:20260501");
  expect(ical).toContain("DTEND;VALUE=DATE:20260502");
});

test("buildVEvent includes optional fields", () => {
  const ical = buildVEvent({
    summary: "S",
    start: "2026-05-01T14:00:00Z",
    end: "2026-05-01T15:00:00Z",
    description: "d",
    location: "l",
    rrule: "FREQ=WEEKLY",
    attendees: [{ email: "a@x.com", name: "A", role: "REQ-PARTICIPANT" }],
  });
  expect(ical).toContain("DESCRIPTION:d");
  expect(ical).toContain("LOCATION:l");
  expect(ical).toContain("RRULE:FREQ=WEEKLY");
  expect(ical).toContain('ATTENDEE;CN="A";ROLE=REQ-PARTICIPANT:mailto:a@x.com');
});

test("parseVEvent round-trips a built event", () => {
  const ical = buildVEvent({
    summary: "Standup",
    start: "2026-05-01T14:00:00Z",
    end: "2026-05-01T15:00:00Z",
    description: "Daily",
    location: "Zoom",
  });
  const parsed = parseVEvent(ical);
  expect(parsed.summary).toBe("Standup");
  expect(parsed.start).toBe("2026-05-01T14:00:00.000Z");
  expect(parsed.end).toBe("2026-05-01T15:00:00.000Z");
  expect(parsed.description).toBe("Daily");
  expect(parsed.location).toBe("Zoom");
  expect(parsed.allDay).toBe(false);
});

test("parseVEvent unescapes text", () => {
  const ical = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x@caldav-mcp.local",
    "DTSTAMP:20260101T000000Z",
    "DTSTART:20260501T140000Z",
    "DTEND:20260501T150000Z",
    "SUMMARY:a\\, b\\; c",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  expect(parseVEvent(ical).summary).toBe("a, b; c");
});

test("buildVEvent with TZID emits wall-clock digits verbatim from naive ISO", () => {
  const ical = buildVEvent({
    summary: "S",
    start: "2026-07-15T14:00:00",
    end: "2026-07-15T15:00:00",
    timezone: "America/Vancouver",
  });
  expect(ical).toContain("DTSTART;TZID=America/Vancouver:20260715T140000");
  expect(ical).toContain("DTEND;TZID=America/Vancouver:20260715T150000");
});

test("buildVEvent with TZID converts zoned ISO to target-zone wall clock", () => {
  // UTC 21:00 on 2026-07-15 is 14:00 America/Vancouver (PDT, UTC-7).
  const ical = buildVEvent({
    summary: "S",
    start: "2026-07-15T21:00:00Z",
    end: "2026-07-15T22:00:00Z",
    timezone: "America/Vancouver",
  });
  expect(ical).toContain("DTSTART;TZID=America/Vancouver:20260715T140000");
  expect(ical).toContain("DTEND;TZID=America/Vancouver:20260715T150000");
});

test("parseVEvent captures TZID and preserves wall-clock time", () => {
  const ical = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x@caldav-mcp.local",
    "DTSTAMP:20260101T000000Z",
    "DTSTART;TZID=America/Vancouver:20260715T140000",
    "DTEND;TZID=America/Vancouver:20260715T150000",
    "SUMMARY:S",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const parsed = parseVEvent(ical);
  expect(parsed.timezone).toBe("America/Vancouver");
  expect(parsed.start).toBe("2026-07-15T14:00:00");
  expect(parsed.end).toBe("2026-07-15T15:00:00");
});

test("parseVEvent + buildVEvent round-trip preserves TZID without producing NaN", () => {
  const original = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x@caldav-mcp.local",
    "DTSTAMP:20260101T000000Z",
    "DTSTART;TZID=America/Vancouver:20260715T140000",
    "DTEND;TZID=America/Vancouver:20260715T150000",
    "SUMMARY:S",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const parsed = parseVEvent(original);
  const rebuilt = buildVEvent({
    summary: parsed.summary ?? "",
    start: parsed.start,
    end: parsed.end,
    timezone: parsed.timezone,
    uid: parsed.uid,
  });
  expect(rebuilt).toContain("DTSTART;TZID=America/Vancouver:20260715T140000");
  expect(rebuilt).toContain("DTEND;TZID=America/Vancouver:20260715T150000");
  expect(rebuilt).not.toContain("NaN");
});

test("parseVEvent handles folded lines", () => {
  const ical = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x@caldav-mcp.local",
    "DTSTAMP:20260101T000000Z",
    "DTSTART:20260501T140000Z",
    "DTEND:20260501T150000Z",
    "SUMMARY:This is a very long summa",
    " ry that was folded",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  expect(parseVEvent(ical).summary).toBe("This is a very long summary that was folded");
});

test("buildVEvent emits a VTIMEZONE before the VEVENT for a DST zone", () => {
  const ical = buildVEvent({
    summary: "Call",
    start: "2026-06-10T10:30:00",
    end: "2026-06-10T11:30:00",
    timezone: "Europe/Paris",
  });
  // VTIMEZONE present and positioned before the VEVENT.
  expect(ical).toContain("BEGIN:VTIMEZONE");
  expect(ical).toContain("TZID:Europe/Paris");
  expect(ical.indexOf("BEGIN:VTIMEZONE")).toBeLessThan(ical.indexOf("BEGIN:VEVENT"));
  // Summer in Paris is CEST (+0200), so a DAYLIGHT observance applies.
  expect(ical).toContain("BEGIN:DAYLIGHT");
  expect(ical).toContain("TZOFFSETFROM:+0100");
  expect(ical).toContain("TZOFFSETTO:+0200");
  // The event keeps its wall-clock TZID reference.
  expect(ical).toContain("DTSTART;TZID=Europe/Paris:20260610T103000");
  expect(ical).toContain("DTEND;TZID=Europe/Paris:20260610T113000");
  expect(ical).not.toContain("NaN");
});

test("buildVEvent emits UTC as a Zulu time with no TZID", () => {
  const ical = buildVEvent({
    summary: "Sync",
    start: "2026-06-10T08:30:00",
    end: "2026-06-10T09:30:00",
    timezone: "UTC",
  });
  expect(ical).toContain("DTSTART:20260610T083000Z");
  expect(ical).toContain("DTEND:20260610T093000Z");
  // Never the bare TZID=UTC that servers rewrite to the invalid "/UTC".
  expect(ical).not.toContain("TZID=UTC");
  expect(ical).not.toContain("/UTC");
  expect(ical).not.toContain("BEGIN:VTIMEZONE");
});

test("buildVEvent emits a single STANDARD observance for a non-DST zone", () => {
  const ical = buildVEvent({
    summary: "Call",
    start: "2026-06-10T10:30:00",
    end: "2026-06-10T11:30:00",
    timezone: "Asia/Tokyo",
  });
  expect(ical).toContain("TZID:Asia/Tokyo");
  expect(ical).toContain("BEGIN:STANDARD");
  expect(ical).not.toContain("BEGIN:DAYLIGHT");
  expect(ical).toContain("TZOFFSETTO:+0900");
  expect(ical).toContain("DTSTART;TZID=Asia/Tokyo:20260610T103000");
});

test("buildVEvent falls back to a bare TZID for zones Intl cannot resolve", () => {
  const ical = buildVEvent({
    summary: "Call",
    start: "2026-06-04T09:30:00",
    end: "2026-06-04T10:15:00",
    timezone: "W. Europe Standard Time",
  });
  // No VTIMEZONE we cannot build correctly; preserve the prior behavior.
  expect(ical).not.toContain("BEGIN:VTIMEZONE");
  expect(ical).toContain("DTSTART;TZID=W. Europe Standard Time:20260604T093000");
  expect(ical).toContain("DTEND;TZID=W. Europe Standard Time:20260604T101500");
});

test("buildVEvent VTIMEZONE does not disturb parseVEvent round-trips", () => {
  const ical = buildVEvent({
    summary: "Standup",
    start: "2026-07-15T14:00:00",
    end: "2026-07-15T15:00:00",
    timezone: "America/Vancouver",
  });
  const parsed = parseVEvent(ical);
  expect(parsed.timezone).toBe("America/Vancouver");
  expect(parsed.start).toBe("2026-07-15T14:00:00");
  expect(parsed.end).toBe("2026-07-15T15:00:00");
  expect(parsed.summary).toBe("Standup");
});
