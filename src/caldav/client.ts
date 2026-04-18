import { DAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import { buildVEvent, parseVEvent, type BuildVEventInput, type ParsedEvent } from "./ical";

export type CaldavCredentials = {
  serverUrl: string;
  username: string;
  password: string;
};

export type ListedCalendar = {
  url: string;
  displayName: string;
  description?: string;
  color?: string;
  ctag?: string;
  timezone?: string;
  components: string[];
  readOnly: boolean;
};

export type FreebusyRange = { start: string; end: string };

export interface CaldavClient {
  listCalendars(opts?: { includeReadOnly?: boolean }): Promise<ListedCalendar[]>;
  fetchEventsInRange(input: {
    calendarUrl: string;
    start: string;
    end: string;
    expand?: boolean;
  }): Promise<{
    events: ParsedEvent[];
    etagByUrl: Record<string, string>;
    urlByUid: Record<string, string>;
  }>;
  getEvent(input: {
    calendarUrl: string;
    eventUrl: string;
  }): Promise<{ event: ParsedEvent; etag: string }>;
  createEvent(
    input: BuildVEventInput & { calendarUrl: string },
  ): Promise<{ uid: string; url: string; etag: string }>;
  updateEvent(input: {
    eventUrl: string;
    etag: string;
    patch: Partial<BuildVEventInput> & { calendarUrl?: string };
  }): Promise<{ uid: string; url: string; etag: string }>;
  deleteEvent(input: { eventUrl: string; etag?: string }): Promise<void>;
  queryFreebusy(input: {
    calendarUrls: string[];
    start: string;
    end: string;
  }): Promise<{ results: { calendarUrl: string; busy: FreebusyRange[] }[] }>;
}

const toListed = (c: DAVCalendar): ListedCalendar => {
  const raw = c as DAVCalendar & {
    readOnly?: boolean;
    calendarColor?: string;
    ctag?: string;
  };
  const displayName =
    typeof c.displayName === "string"
      ? c.displayName
      : ((c.displayName as Record<string, unknown> | undefined)?._cdata?.toString() ?? c.url);
  return {
    url: c.url,
    displayName,
    description: typeof c.description === "string" ? c.description : undefined,
    color: raw.calendarColor ?? undefined,
    ctag: raw.ctag ?? undefined,
    timezone: c.timezone ?? undefined,
    components: Array.isArray(c.components) ? c.components : ["VEVENT"],
    readOnly: raw.readOnly ?? false,
  };
};

export const createCaldavClient = (creds: CaldavCredentials): CaldavClient => {
  const client = new DAVClient({
    serverUrl: creds.serverUrl,
    credentials: { username: creds.username, password: creds.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });

  let loggedIn = false;
  const login = async () => {
    if (!loggedIn) {
      await client.login();
      loggedIn = true;
    }
  };

  const ensureCalendar = async (url: string): Promise<DAVCalendar> => {
    await login();
    const calendars = await client.fetchCalendars();
    const found = calendars.find(
      (c) => c.url === url || c.url === url + "/" || c.url + "/" === url,
    );
    if (!found) throw new Error(`Calendar not found: ${url}`);
    return found;
  };

  return {
    async listCalendars(opts) {
      await login();
      const calendars = await client.fetchCalendars();
      const mapped = calendars.map(toListed);
      return opts?.includeReadOnly === false ? mapped.filter((c) => !c.readOnly) : mapped;
    },

    async fetchEventsInRange(input) {
      const calendar = await ensureCalendar(input.calendarUrl);
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: input.start, end: input.end },
        expand: input.expand ?? true,
      });
      const events: ParsedEvent[] = [];
      const etagByUrl: Record<string, string> = {};
      const urlByUid: Record<string, string> = {};
      for (const o of objects as DAVCalendarObject[]) {
        const parsed = parseVEvent(o.data ?? "");
        events.push(parsed);
        if (o.url) {
          etagByUrl[o.url] = o.etag ?? "";
          if (parsed.uid) urlByUid[parsed.uid] = o.url;
        }
      }
      return { events, etagByUrl, urlByUid };
    },

    async getEvent(input) {
      const calendar = await ensureCalendar(input.calendarUrl);
      const objects = await client.fetchCalendarObjects({
        calendar,
        objectUrls: [input.eventUrl],
        useMultiGet: true,
      });
      const obj = objects[0];
      if (!obj) throw new Error(`Event not found: ${input.eventUrl}`);
      return { event: parseVEvent(obj.data ?? ""), etag: obj.etag ?? "" };
    },

    async createEvent(input) {
      const { calendarUrl, ...rest } = input;
      const calendar = await ensureCalendar(calendarUrl);
      const iCalString = buildVEvent(rest);
      const uidMatch = /UID:([^\r\n]+)/.exec(iCalString);
      const uid = uidMatch ? uidMatch[1] : `${crypto.randomUUID()}@caldav-mcp.local`;
      const filename = `${uid}.ics`;
      const res = await client.createCalendarObject({ calendar, iCalString, filename });
      if (!res.ok) throw new Error(`createCalendarObject failed: ${res.status} ${res.statusText}`);
      const url = (calendar.url.endsWith("/") ? calendar.url : calendar.url + "/") + filename;
      const etag = res.headers.get("etag") ?? "";
      return { uid, url, etag };
    },

    async updateEvent(input) {
      await login();
      const calendarUrl = input.patch.calendarUrl ?? input.eventUrl.replace(/[^/]+$/, "");
      const existing = await client.fetchCalendarObjects({
        calendar: { url: calendarUrl } as DAVCalendar,
        objectUrls: [input.eventUrl],
        useMultiGet: true,
      });
      const current = existing[0];
      if (!current) throw new Error(`Event not found: ${input.eventUrl}`);
      const parsed = parseVEvent(current.data ?? "");
      const merged = buildVEvent({
        summary: input.patch.summary ?? parsed.summary ?? "",
        start: input.patch.start ?? parsed.start,
        end: input.patch.end ?? parsed.end,
        allDay: input.patch.allDay ?? parsed.allDay,
        description: input.patch.description ?? parsed.description,
        location: input.patch.location ?? parsed.location,
        rrule: input.patch.rrule ?? parsed.rrule,
        attendees: input.patch.attendees ?? parsed.attendees,
        timezone: input.patch.timezone,
        uid: parsed.uid,
      });
      const res = await client.updateCalendarObject({
        calendarObject: { url: input.eventUrl, data: merged, etag: input.etag },
      });
      if (!res.ok) throw new Error(`updateCalendarObject failed: ${res.status} ${res.statusText}`);
      return {
        uid: parsed.uid,
        url: input.eventUrl,
        etag: res.headers.get("etag") ?? "",
      };
    },

    async deleteEvent(input) {
      await login();
      const res = await client.deleteCalendarObject({
        calendarObject: { url: input.eventUrl, etag: input.etag ?? "" },
      });
      if (!res.ok && res.status !== 404) {
        throw new Error(`deleteCalendarObject failed: ${res.status} ${res.statusText}`);
      }
    },

    async queryFreebusy(input) {
      const results: { calendarUrl: string; busy: FreebusyRange[] }[] = [];
      for (const url of input.calendarUrls) {
        const { events } = await this.fetchEventsInRange({
          calendarUrl: url,
          start: input.start,
          end: input.end,
          expand: true,
        });
        const busy = events
          .filter((e) => e.status !== "CANCELLED")
          .map((e) => ({ start: e.start, end: e.end }));
        results.push({ calendarUrl: url, busy });
      }
      return { results };
    },
  };
};
