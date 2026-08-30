export type RegistrationType = "team" | "individual";

export interface TechEvent {
  id: string;
  dayId: string;
  category: string;
  name: string;
  description: string;
  image?: string;
  venue?: string;
  time?: string;
  duration?: string;
  coordinator?: string;
  registrationOpen: boolean;
  registrationType?: RegistrationType;
  requiredPlayers?: number;
  maxSubstitutes?: number;
  registrationFee?: number;
  rules?: string[];
  eligibility?: string[];
  prizes?: string[];
}

export type DayStatus = "active" | "coming-soon";

export interface Day {
  id: string;
  label: string;
  name: string;
  description: string;
  status: DayStatus;
  events: TechEvent[];
}

export interface Stat {
  value: string;
  label: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  note?: string;
}

export interface RuleSection {
  id: string;
  title: string;
  items: string[];
}

export interface SponsorSlot {
  name?: string;
  logo?: string;
}

export interface SponsorTier {
  tier: string;
  slots: SponsorSlot[];
}

export const siteConfig = {
  name: "TechTrove 3.0",
  presenter: "SIMATS",
  tagline: "Innovate. Compete. Conquer.",
  description:
    "TechTrove 3.0 is the multi-day technical and sports symposium of SIMATS - three days of competition, creativity and collaboration across engineering, design and athletics.",
  eventDate: "Date to be announced",
  venue: "SIMATS Campus, Chennai",
  stats: [
    { value: "1000+", label: "Participants" },
    { value: "25+", label: "Events" },
    { value: "50+", label: "Colleges" },
    { value: "TBA", label: "Prize Pool" },
  ] as Stat[],
  marqueeItems: ["Day 1 · Sports", "Day 2 · Technical", "Day 3 · Non-Technical", "TechTrove 3.0"],
  contact: {
    committee: "TechTrove 3.0 Organizing Committee",
    college: "SIMATS, Chennai",
    email: "techtrove@example.edu",
    phone: "+91 00000 00000",
    venue: "SIMATS Campus, Chennai",
  },
  socials: [
    { label: "Instagram", url: "https://www.instagram.com/techtrove_3.0/" },
  ],
};

// ─── Day metadata (used by eventStore to order days) ────────────────────────
// Events are loaded from Supabase — the events array here is always empty.
// The actual event data lives in the Supabase `events` table.

export const days: Day[] = [
  {
    id: "day-1",
    label: "Day 1",
    name: "Sports",
    description:
      "The symposium opens on the field. Compete across eight sports — from cricket to chess — and bring glory to your college.",
    status: "active",
    events: [],
  },
  {
    id: "day-2",
    label: "Day 2",
    name: "Technical",
    description:
      "A day dedicated to technical excellence. Six events spanning paper presentation, hackathon, debugging, quiz, logo making, and the multi-stage Tech Maze.",
    status: "active",
    events: [],
  },
  {
    id: "day-3",
    label: "Day 3",
    name: "Non-Technical",
    description:
      "Unleash your creativity and perform on the biggest stage. Eight non-technical events spanning fashion, dance, music, gaming, and more.",
    status: "active",
    events: [],
  },
];

export const allEvents: TechEvent[] = days.flatMap((d) => d.events);

export function getEvent(id: string | undefined): TechEvent | undefined {
  return allEvents.find((e) => e.id === id);
}

export function getDay(id: string): Day | undefined {
  return days.find((d) => d.id === id);
}

export const schedule: Record<string, ScheduleItem[]> = {
  "day-1": [
    { time: "09:00", title: "Registration", note: "On-spot team check-in at the venue desk." },
    { time: "10:00", title: "Opening ceremony", note: "Symposium inauguration." },
    { time: "10:30", title: "Fixtures and group stage", note: "All eight sports begin." },
    { time: "13:00", title: "Break", note: "Lunch and recovery window." },
    { time: "14:00", title: "Knockout rounds", note: "Progression fixtures." },
    { time: "17:00", title: "Finals and closing", note: "Finals followed by results." },
  ],
  "day-2": [
    { time: "09:00", title: "Registration", note: "Check-in at the technical event venue." },
    { time: "10:00", title: "Opening session", note: "Welcome and event briefing." },
    { time: "10:30", title: "Technical events begin", note: "Paper Presentation, Hackathon, Debugging, Quiz, Logo Making, Tech Maze." },
    { time: "13:00", title: "Break", note: "Lunch break." },
    { time: "14:00", title: "Events continue", note: "Remaining heats and finals." },
    { time: "17:00", title: "Results and closing", note: "Prize distribution." },
  ],
  "day-3": [
    { time: "09:00", title: "Registration", note: "Check-in at the non-technical event venue." },
    { time: "10:00", title: "Opening session", note: "Welcome and event briefing." },
    { time: "10:30", title: "Non-technical events begin", note: "Ramp Walk, Dance, TuneTopia, Treasure Hunt, Mobile Gaming, Adaptune, Singing, Connexion." },
    { time: "13:00", title: "Break", note: "Lunch break." },
    { time: "14:00", title: "Events continue", note: "Remaining performances and rounds." },
    { time: "17:00", title: "Grand finale & closing", note: "Final performances and prize distribution." },
  ],
};

export const ruleSections: RuleSection[] = [
  {
    id: "general",
    title: "General symposium rules",
    items: ["To be announced by the organizing committee."],
  },
  {
    id: "registration",
    title: "Registration rules",
    items: [
      "Every team must complete registration through the TechTrove 3.0 portal.",
      "Team captain details are mandatory for each registration.",
      "Player counts must match the limits published for each event.",
      "One registration per team per event.",
    ],
  },
  {
    id: "payment",
    title: "Payment rules",
    items: [
      "The registration fee for each event is shown on its detail page.",
      "Fee once paid is non-refundable.",
      "To be announced: final payment instructions.",
    ],
  },
  {
    id: "sports",
    title: "Sports rules",
    items: [
      "Team size must match the published player and substitute limits for the sport.",
      "All players must be enrolled students of the college they represent.",
      "Valid college identification is mandatory at the venue on match day.",
      "Teams must report to the venue at least 30 minutes before their fixture.",
      "The decision of the match officials and organizing committee is final.",
    ],
  },
  {
    id: "technical",
    title: "Technical event rules",
    items: [
      "Technical events are held on Day 2.",
      "Events: Paper Presentation, Hackathon, Debugging, Quiz, Logo Making, Tech Maze.",
      "Each event has its own specific rules available on the event detail page.",
      "No electronic devices, AI tools, or internet access unless explicitly permitted by the event.",
    ],
  },
  {
    id: "non-technical",
    title: "Non-technical event rules",
    items: [
      "Non-technical events are held on Day 3.",
      "Events: Ramp Walk, Solo/Group Dance, TuneTopia, Treasure Hunt, Mobile Gaming (BGMI/FreeFire), Adaptune, Singing (Solo/Group), Connexion.",
      "Each event has its own specific rules available on the event detail page.",
      "Participants must register before the deadline.",
    ],
  },
];

export const sponsors: SponsorTier[] = [
  { tier: "Title sponsor", slots: [{}] },
  { tier: "Powered by", slots: [{}] },
  { tier: "Associate", slots: [{}, {}] },
  { tier: "Partner", slots: [{}, {}] },
];
