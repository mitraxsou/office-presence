/** Fixture data matching the v2 design frames (names, times, counts). */

export const FRAME_PERSON = {
  name: "Aditi Mehra",
  email: "aditi.mehra@pwc.com",
  initials: "AM",
  role: "user" as const,
};

export const FRAME_ADMIN = {
  name: "Kavya Rao",
  email: "kavya.rao@pwc.com",
  initials: "KR",
  role: "admin" as const,
};

export const FRAME_OFFICES = [
  { id: "off-ggn", name: "Gurugram, Tower B", addressLabel: "Building 10, Tower B, DLF Cyber City, Gurugram 122002", radiusMeters: 100, pointsPerVisitDay: 4, inNow: 23 },
  { id: "off-cyber", name: "Gurugram, Cyber City", addressLabel: "DLF Cyber City, Gurugram", radiusMeters: 120, pointsPerVisitDay: 4, inNow: 8 },
  { id: "off-kol", name: "Kolkata, Plot Y14", addressLabel: "Plot Y14, Kolkata", radiusMeters: 100, pointsPerVisitDay: 1, inNow: 5 },
  { id: "off-blr", name: "Bengaluru, Prestige", addressLabel: "Prestige Tech Park, Bengaluru", radiusMeters: 150, pointsPerVisitDay: 1, inNow: 4 },
  { id: "off-pune", name: "Pune, Kharadi", addressLabel: "Kharadi, Pune", radiusMeters: 120, pointsPerVisitDay: 4, inNow: 2 },
];

export const FRAME_TODAY = {
  inOffice: true,
  officeName: "Gurugram, Tower B",
  sinceAt: "2026-10-27T09:42:00+05:30",
  sinceLabel: "For 2 h 32 m, since 9:42 am",
  hoursToday: 2.53,
  monthPoints: 5,
  pointsTarget: 8,
  monthVisitDays: 4,
  updatedAgo: "Updated 1 min ago",
  colleaguesIn: [
    { name: "Rohan Kapoor", initials: "RK" },
    { name: "Sneha Nair", initials: "SN" },
    { name: "Priya Venkat", initials: "PV" },
  ],
};

export const FRAME_MONTH_DAYS = [
  { dayKey: "2026-10-06", points: 1, officeName: "Gurugram", label: "1 point" },
  { dayKey: "2026-10-14", points: 2, officeName: "Kolkata", label: "2 points" },
  { dayKey: "2026-10-21", points: 1, officeName: "Gurugram", label: "1 point" },
  { dayKey: "2026-10-27", points: 1, officeName: "Gurugram", label: "1 point", inNow: true },
];

export const FRAME_DAY_DETAIL = {
  dayKey: "2026-10-15",
  weekday: "Thu 15 Oct",
  officeName: "Gurugram, Tower B",
  points: 0,
  hours: 0,
  intervals: [] as { startAt: string; endAt: string; hours: number; officeName: string; source: string }[],
  pending: false,
};

export const FRAME_CORRECTION = {
  dayKey: "2026-10-15",
  weekday: "Thu 15 Oct",
  issue: "missing_visit" as const,
  issueLabel: "A visit is missing",
  officeId: "off-ggn",
  officeName: "Gurugram, Tower B",
  inAt: "09:30",
  outAt: "18:00",
  reason: "My phone battery died at 9 am. I was at my desk all day.",
  daysBefore: 5,
  daysAfter: 6,
  status: "pending" as const,
};

export const FRAME_CORRECTION_REQUESTS = {
  closeDate: "October requests close on 5 Nov. After that the month is locked.",
  open: [
    { dayKey: "2026-10-15", label: "Thu 15 Oct", detail: "A visit is missing, sent today", status: "pending" as const },
  ],
  decided: [
    { dayKey: "2026-10-09", label: "Fri 9 Oct", detail: "Times are wrong, decided 12 Oct", status: "approved" as const },
    { dayKey: "2026-10-05", label: "Mon 5 Oct", detail: "Wrong office, decided 7 Oct", status: "rejected" as const },
    { dayKey: "2026-09-30", label: "Wed 30 Sep", detail: "A visit is missing, cancelled by you", status: "cancelled" as const },
  ],
};

export const FRAME_COLLEAGUES = [
  { id: "1", name: "Rohan Kapoor", email: "rohan.kapoor@pwc.com", initials: "RK", inOffice: true, sinceAt: "9:15 am", officeName: "Gurugram, Tower B" },
  { id: "2", name: "Sneha Nair", email: "sneha.nair@pwc.com", initials: "SN", inOffice: true, sinceAt: "9:58 am", officeName: "Gurugram, Tower B" },
  { id: "3", name: "Arjun Joshi", email: "arjun.joshi@pwc.com", initials: "AJ", inOffice: false, sinceAt: "yesterday 6:40 pm", officeName: "Gurugram, Tower B" },
  { id: "4", name: "Meera Das", email: "meera.das@pwc.com", initials: "MD", inOffice: false, sinceAt: "Fri 5:55 pm", officeName: "Kolkata, Plot Y14" },
];

export const FRAME_DEVICES = [
  { id: "d1", label: "Pixel 8", lastSeenLabel: "Synced 1 min ago", thisPhone: true },
  { id: "d2", label: "Galaxy S23", lastSeenLabel: "Last sync 3 days ago", thisPhone: false },
];

export const FRAME_ROSTER_STATS = { inNow: 46, out: 212, belowTarget: 31, goalMet: 118 };

export const FRAME_ROSTER_ROWS = [
  { id: "u1", name: "Arjun Joshi", email: "arjun.joshi@pwc.com", inOffice: false, sinceLabel: "Yesterday 6:40 pm", officeName: "Gurugram, Tower B", monthPoints: 1, pointsTarget: 8, hoursToday: 0, lastDeviceName: "Pixel 8", noRecentSync: false },
  { id: "u2", name: "Aditi Mehra", email: "aditi.mehra@pwc.com", inOffice: true, sinceLabel: "9:15 am", officeName: "Gurugram, Tower B", monthPoints: 5, pointsTarget: 8, hoursToday: 2.53, lastDeviceName: "Pixel 8", noRecentSync: false },
  { id: "u3", name: "Meera Das", email: "meera.das@pwc.com", inOffice: false, sinceLabel: "Fri 5:55 pm", officeName: "Kolkata, Plot Y14", monthPoints: 5, pointsTarget: 8, hoursToday: 0, lastDeviceName: "Galaxy S23", noRecentSync: false },
  { id: "u4", name: "Priya Venkat", email: "priya.venkat@pwc.com", inOffice: false, sinceLabel: "Last seen Mon", officeName: "Unknown", monthPoints: 0, pointsTarget: 8, hoursToday: 0, lastDeviceName: "-", noRecentSync: true },
];

export const FRAME_CORRECTIONS_QUEUE = [
  { id: "c1", person: "Aditi Mehra", email: "aditi.mehra@pwc.com", dayKey: "2026-10-15", dayLabel: "Thu 15 Oct", issue: "A visit is missing", recorded: "No visit", requested: "Gurugram, Tower B, 9:30 am to 6:00 pm", status: "pending" },
  { id: "c2", person: "Arjun Joshi", email: "arjun.joshi@pwc.com", dayKey: "2026-10-14", dayLabel: "Wed 14 Oct", issue: "Wrong office", recorded: "Gurugram, Tower B", requested: "Kolkata, Plot Y14", status: "pending" },
  { id: "c3", person: "Meera Das", email: "meera.das@pwc.com", dayKey: "2026-10-13", dayLabel: "Tue 13 Oct", issue: "Times are wrong", recorded: "11:02 am to 4:05 pm", requested: "9:30 am to 6:00 pm", status: "pending" },
];

export const FRAME_LIST = [
  "03_P-Login-Email",
  "04_P-Login-Code",
  "05_P-Login-Sending-code",
  "06_P-Login-Code-failed",
  "07_P-Today-In",
  "08_P-Today-In-Dark",
  "09_P-Today-Out",
  "10_P-Today-Permissions-needed",
  "11_P-Today-Loading",
  "12_P-Month-In-progress",
  "13_P-Month-In-progress-Dark",
  "14_P-Month-Goal-met",
  "15_P-Month-Day-detail",
  "16_P-Correction-Choose-issue",
  "17_P-Correction-Edit-day",
  "18_P-Correction-Review-and-send",
  "19_P-Correction-Sent",
  "20_P-Month-Day-pending",
  "21_P-Correction-Approved",
  "22_P-Correction-Not-approved",
  "23_P-You-Correction-requests",
  "24_P-Colleagues-List",
  "25_P-Colleagues-List-Dark",
  "26_P-Colleagues-Opted-out",
  "27_P-Colleagues-Empty",
  "28_P-You-Settings",
  "29_P-You-Devices",
  "30_W-Login",
  "31_W-Login-Sending-code",
  "32_W-Login-Code-failed",
  "33_W-Month",
  "34_W-Month-Day-open",
  "35_W-Month-Request-a-correction",
  "36_W-Colleagues",
  "37_W-Settings",
  "38_W-Admin-Roster",
  "39_W-Admin-Roster-Dark",
  "40_W-Admin-Roster-Loading",
  "41_W-Admin-Roster-Empty",
  "42_W-Admin-Roster-Error",
  "43_W-Admin-Corrections",
  "44_W-Admin-Corrections-Review",
  "45_W-Admin-Corrections-Reject",
  "46_W-Admin-Corrections-Empty",
  "47_W-Admin-Offices-list-plus-map",
  "48_W-Admin-Reports",
  "49_W-Admin-Rules",
  "50_W-Admin-Person-visits",
] as const;

export type FrameId = (typeof FRAME_LIST)[number];
