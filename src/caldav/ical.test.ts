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
