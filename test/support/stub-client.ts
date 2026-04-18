import type { CaldavClient } from "../../src/caldav/client";

export const createStubClient = (overrides: Partial<CaldavClient> = {}): CaldavClient => ({
  async listCalendars() {
    return [
      {
        url: "https://caldav.example.com/cal/default/",
        displayName: "Default",
        components: ["VEVENT"],
        readOnly: false,
      },
    ];
  },
  async fetchEventsInRange() {
    return { events: [], etagByUrl: {}, urlByUid: {} };
  },
  async getEvent() {
    return {
      event: {
        uid: "e1",
        start: "2026-05-01T14:00:00.000Z",
        end: "2026-05-01T15:00:00.000Z",
        allDay: false,
        attendees: [],
        iCalendar: "",
      },
      etag: 'W/"1"',
    };
  },
  async createEvent() {
    return { uid: "new", url: "https://caldav.example.com/cal/default/new.ics", etag: 'W/"1"' };
  },
  async updateEvent() {
    return { uid: "e1", url: "https://caldav.example.com/cal/default/e1.ics", etag: 'W/"2"' };
  },
  async deleteEvent() {},
  async queryFreebusy() {
    return { results: [] };
  },
  ...overrides,
});
