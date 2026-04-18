export type Attendee = {
  email: string;
  name?: string;
  role?: "CHAIR" | "REQ-PARTICIPANT" | "OPT-PARTICIPANT" | "NON-PARTICIPANT";
};

export type BuildVEventInput = {
  summary: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  rrule?: string;
  attendees?: Attendee[];
  timezone?: string;
  uid?: string;
  dtstamp?: string;
};

export type ParsedEvent = {
  uid: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone?: string;
  rrule?: string;
  recurrenceId?: string;
  attendees: Attendee[];
  iCalendar: string;
};

export const escapeText = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");

export const unescapeText = (s: string): string =>
  s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

export const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 75) {
    chunks.push(line.slice(i, i + 75));
  }
  return chunks.join("\r\n ");
};

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

const toIcalUtc = (iso: string): string => {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
};

const toIcalDate = (iso: string): string => iso.replaceAll("-", "").slice(0, 8);

const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const toIcalLocalWallClock = (iso: string, tz: string): string => {
  const naive = NAIVE_ISO.exec(iso);
  if (naive) return `${naive[1]}${naive[2]}${naive[3]}T${naive[4]}${naive[5]}${naive[6] ?? "00"}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid datetime for TZID=${tz}: ${iso}`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
};

const fromIcalUtc = (s: string): string => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return s;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString();
};

const fromIcalLocalNaive = (s: string): string => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
};

const fromIcalDate = (s: string): string => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const attendeeLine = (a: Attendee): string => {
  const parts: string[] = ["ATTENDEE"];
  if (a.name) parts.push(`CN="${a.name.replace(/"/g, '\\"')}"`);
  if (a.role) parts.push(`ROLE=${a.role}`);
  return parts.join(";") + `:mailto:${a.email}`;
};

export const buildVEvent = (input: BuildVEventInput): string => {
  const uid = input.uid ?? `${crypto.randomUUID()}@caldav-mcp.local`;
  const dtstamp = input.dtstamp ?? toIcalUtc(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//wyattjoh//caldav-mcp//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
  ];

  if (input.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toIcalDate(input.start)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcalDate(input.end)}`);
  } else if (input.timezone) {
    lines.push(
      `DTSTART;TZID=${input.timezone}:${toIcalLocalWallClock(input.start, input.timezone)}`,
    );
    lines.push(`DTEND;TZID=${input.timezone}:${toIcalLocalWallClock(input.end, input.timezone)}`);
  } else {
    lines.push(`DTSTART:${toIcalUtc(input.start)}`);
    lines.push(`DTEND:${toIcalUtc(input.end)}`);
  }

  lines.push(`SUMMARY:${escapeText(input.summary)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.rrule) lines.push(`RRULE:${input.rrule}`);
  for (const a of input.attendees ?? []) lines.push(attendeeLine(a));

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
};

const unfold = (src: string): string[] => {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
};

const parseParams = (
  raw: string,
): { name: string; params: Record<string, string>; value: string } => {
  const colon = raw.indexOf(":");
  const head = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name ?? "", params, value };
};

const parseAttendee = (params: Record<string, string>, value: string): Attendee => {
  const email = value.replace(/^mailto:/i, "");
  const role = params.ROLE as Attendee["role"];
  return {
    email,
    ...(params.CN !== undefined ? { name: params.CN } : {}),
    ...(role !== undefined ? { role } : {}),
  };
};

export const parseVEvent = (iCalendar: string): ParsedEvent => {
  const lines = unfold(iCalendar);
  let inEvent = false;
  const event: ParsedEvent = {
    uid: "",
    start: "",
    end: "",
    allDay: false,
    attendees: [],
    iCalendar,
  };
  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (raw === "END:VEVENT") {
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    const { name, params, value } = parseParams(raw);
    switch (name) {
      case "UID":
        event.uid = value;
        break;
      case "SUMMARY":
        event.summary = unescapeText(value);
        break;
      case "DESCRIPTION":
        event.description = unescapeText(value);
        break;
      case "LOCATION":
        event.location = unescapeText(value);
        break;
      case "STATUS":
        event.status = value;
        break;
      case "DTSTART":
        if (params.VALUE === "DATE") {
          event.start = fromIcalDate(value);
          event.allDay = true;
        } else if (params.TZID) {
          event.timezone = params.TZID;
          event.start = fromIcalLocalNaive(value);
        } else {
          event.start = fromIcalUtc(value);
        }
        break;
      case "DTEND":
        if (params.VALUE === "DATE") {
          event.end = fromIcalDate(value);
          event.allDay = true;
        } else if (params.TZID) {
          event.timezone = params.TZID;
          event.end = fromIcalLocalNaive(value);
        } else {
          event.end = fromIcalUtc(value);
        }
        break;
      case "RRULE":
        event.rrule = value;
        break;
      case "RECURRENCE-ID":
        event.recurrenceId = fromIcalUtc(value);
        break;
      case "ATTENDEE":
        event.attendees.push(parseAttendee(params, value));
        break;
    }
  }
  return event;
};
