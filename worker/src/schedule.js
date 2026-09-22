// Your availability for calls. Edit, then `npx wrangler deploy`.
// Times are in TIMEZONE; visitors see them converted to their own timezone.

export const TIMEZONE = "Africa/Cairo";
export const SLOT_MINUTES = 30;       // length of each call
export const MIN_NOTICE_HOURS = 12;   // no bookings sooner than this
export const DAYS_AHEAD = 14;         // how far ahead people can book

// 0 = Sunday ... 6 = Saturday. Each day is a list of ["HH:MM", "HH:MM"] windows.
export const WEEKLY_HOURS = {
  0: [["13:00", "17:00"], ["19:00", "21:00"]],
  1: [["13:00", "17:00"], ["19:00", "21:00"]],
  2: [["13:00", "17:00"], ["19:00", "21:00"]],
  3: [["13:00", "17:00"], ["19:00", "21:00"]],
  4: [["13:00", "17:00"]],
  5: [],                                  // Friday off
  6: [["14:00", "18:00"]]
};

// Specific dates you're unavailable (holidays, travel), as "YYYY-MM-DD" in TIMEZONE.
export const BLOCKED_DATES = [];
