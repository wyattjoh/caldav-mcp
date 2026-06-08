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

const DAY_MS = 86_400_000;

// UTC aliases that are cleaner to emit as a Zulu (`...Z`) time with no TZID at
// all. A bare `TZID=UTC` is rewritten by some servers to the invalid global
// form `/UTC`, which strict clients (ical4j/DAVx5) reject — so we sidestep it.
const isUtcZone = (tz: string): boolean => /^(?:Etc\/)?(?:UTC|Zulu|Universal)$/i.test(tz);

// Append `Z` to a naive ISO string so it is interpreted as UTC rather than the
// host's local zone. Strings that already carry an offset are left untouched.
const ensureInstant = (iso: string): string => (NAIVE_ISO.test(iso) ? `${iso}Z` : iso);

const fmtOffset = (minutes: number): string => {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
};

const parseToEpoch = (iso: string): number => {
  const m = NAIVE_ISO.exec(iso);
  if (m) return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  return Date.parse(iso);
};

const icalFromUtcParts = (ms: number): string => {
  const d = new Date(ms);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
};

type OffsetFn = (ms: number) => number;

// Returns a function giving the UTC offset (in minutes) of `tz` at an instant,
// or null when Intl cannot resolve the zone (e.g. Windows names like
// "W. Europe Standard Time") — the signal to fall back to a bare TZID.
const makeOffsetFn = (tz: string): OffsetFn | null => {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }
  return (ms: number): number => {
    const parts = dtf.formatToParts(new Date(ms));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return Math.round((asUtc - ms) / 60_000);
  };
};

const tzShortName = (tz: string, ms: number, fallbackOffset: number): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
      year: "numeric",
    }).formatToParts(new Date(ms));
    const name = parts.find((p) => p.type === "timeZoneName")?.value;
    if (name && !name.includes(" ")) return name;
  } catch {
    // fall through to the numeric offset name
  }
  return `GMT${fmtOffset(fallbackOffset)}`;
};

type Observance = {
  type: "STANDARD" | "DAYLIGHT";
  onsetMs: number;
  from: number;
  to: number;
  nameMs: number;
};

// Builds a VTIMEZONE for `tz` covering the period around `refMs` by probing the
// real offsets via Intl (no tz database dependency). Emitting the matching
// VTIMEZONE keeps the TZID resolvable in strict clients the way Google/Outlook
// invites do. Returns null for zones Intl cannot resolve (bare-TZID fallback).
const buildVTimezone = (tz: string, refMs: number): string[] | null => {
  const offsetAt = makeOffsetFn(tz);
  if (!offsetAt) return null;

  // A ~400-day window guarantees we capture both DST transitions bracketing the
  // event (transitions are ~6 months apart). Step weekly, then binary-search to
  // the second for each offset change.
  const winStart = refMs - 200 * DAY_MS;
  const winEnd = refMs + 200 * DAY_MS;
  const transitions: { at: number; from: number; to: number }[] = [];
  let prevOff = offsetAt(winStart);
  for (let t = winStart + 7 * DAY_MS; t <= winEnd; t += 7 * DAY_MS) {
    const off = offsetAt(t);
    if (off !== prevOff) {
      let lo = t - 7 * DAY_MS;
      let hi = t;
      const fromOff = prevOff;
      while (hi - lo > 1000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (offsetAt(mid) === fromOff) lo = mid;
        else hi = mid;
      }
      transitions.push({ at: hi, from: fromOff, to: off });
      prevOff = off;
    }
  }

  const baseOff = offsetAt(refMs);
  const observances: Observance[] = [];
  if (transitions.length === 0) {
    // Fixed-offset zone: a single STANDARD observance anchored at the epoch.
    const onsetMs = Date.UTC(1970, 0, 1) - baseOff * 60_000;
    observances.push({ type: "STANDARD", onsetMs, from: baseOff, to: baseOff, nameMs: refMs });
  } else {
    const offsets = transitions.flatMap((tr) => [tr.from, tr.to]);
    const maxOff = Math.max(...offsets);
    const minOff = Math.min(...offsets);
    for (const tr of transitions) {
      const type = maxOff !== minOff && tr.to === maxOff ? "DAYLIGHT" : "STANDARD";
      observances.push({
        type,
        onsetMs: tr.at,
        from: tr.from,
        to: tr.to,
        nameMs: tr.at + 10 * DAY_MS,
      });
    }
  }

  observances.sort((a, b) => a.onsetMs - b.onsetMs);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${tz}`];
  for (const o of observances) {
    lines.push(
      `BEGIN:${o.type}`,
      // DTSTART of an observance is local wall-clock time, i.e. using TZOFFSETFROM.
      `DTSTART:${icalFromUtcParts(o.onsetMs + o.from * 60_000)}`,
      `TZOFFSETFROM:${fmtOffset(o.from)}`,
      `TZOFFSETTO:${fmtOffset(o.to)}`,
      `TZNAME:${tzShortName(tz, o.nameMs, o.to)}`,
      `END:${o.type}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
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

  let vtimezone: string[] = [];
  const dtLines: string[] = [];
  if (input.allDay) {
    dtLines.push(`DTSTART;VALUE=DATE:${toIcalDate(input.start)}`);
    dtLines.push(`DTEND;VALUE=DATE:${toIcalDate(input.end)}`);
  } else if (input.timezone && !isUtcZone(input.timezone)) {
    const tz = input.timezone;
    // Emit the matching VTIMEZONE so the TZID stays resolvable everywhere; a null
    // result (unresolvable zone) falls back to the bare-TZID behavior.
    vtimezone = buildVTimezone(tz, parseToEpoch(input.start)) ?? [];
    dtLines.push(`DTSTART;TZID=${tz}:${toIcalLocalWallClock(input.start, tz)}`);
    dtLines.push(`DTEND;TZID=${tz}:${toIcalLocalWallClock(input.end, tz)}`);
  } else if (input.timezone) {
    // UTC-like zone: emit a clean Zulu time with no TZID (naive input is UTC).
    dtLines.push(`DTSTART:${toIcalUtc(ensureInstant(input.start))}`);
    dtLines.push(`DTEND:${toIcalUtc(ensureInstant(input.end))}`);
  } else {
    dtLines.push(`DTSTART:${toIcalUtc(input.start)}`);
    dtLines.push(`DTEND:${toIcalUtc(input.end)}`);
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//wyattjoh//caldav-mcp//EN",
    "CALSCALE:GREGORIAN",
    ...vtimezone,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    ...dtLines,
  ];

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
