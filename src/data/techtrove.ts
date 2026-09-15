export type RegistrationType = "team" | "individual" | "solo_team";

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
  date: string;
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


export const siteConfig = {
  name: "TechTrove 3.0",
  presenter: "SIMATS",
  tagline: "Innovate. Compete. Conquer.",
  description:
    "TechTrove 3.0 is the multi-day technical and sports symposium of SIMATS - two days of competition, creativity and collaboration across engineering, design and athletics.",
  eventDate: "5 – 6 October",
  venue: "SIMATS Campus, Chennai",
  stats: [
    { value: "1000+", label: "Participants" },
    { value: "25+", label: "Events" },
    { value: "50+", label: "Colleges" },
    { value: "TBA", label: "Prize Pool" },
  ] as Stat[],
  marqueeItems: ["Day 1 · Sports", "Day 2 · Technical and Non-Technical", "TechTrove 3.0"],
  contact: {
    committee: "TechTrove 3.0 Organizing Committee",
    college: "SIMATS, Chennai",
    email: "techtrovein3.0@gmail.com",
    phones: [
      { number: "+91 96771 01571", name: "Kishore Kumar S", role: "Student convenor" },
      { number: "+91 97907 61009", name: "Bala", role: "Organiser" },
      { number: "+91 861 087 3714", name: "Sasvanthu", role: "Organiser" }
    ],
    venue: "SIMATS Campus, Chennai",
  },
  socials: [
    { label: "Instagram", url: "https://www.instagram.com/techtrove_.hackexpress/" },
    { label: "WhatsApp", url: "https://chat.whatsapp.com/F3ca20zjmVoJcu6FCYGPSZ" },
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
    date: "5 October",
    description:
      "The symposium opens on the field. Compete across eight sports — from cricket to chess — and bring glory to your college.",
    status: "active",
    events: [
      {
        id: "sport-khokho-girls",
        dayId: "day-1",
        category: "Sports - Girls",
        name: "Kho-Kho (Girls)",
        description:
          "All-girls Kho-Kho. A fast-paced game of sprint, tag and 'Kho' — chase down the defending team and cut through the field.",
        registrationOpen: true,
        registrationType: "team",
        requiredPlayers: 9,
        maxSubstitutes: 3,
        registrationFee: 600,
      },
      {
        id: "sport-throwball-girls",
        dayId: "day-1",
        category: "Sports - Girls",
        name: "Throwball (Girls)",
        description:
          "All-girls Throwball. Catch with both hands, throw with one — a seven-player game of precision and power over the net.",
        registrationOpen: true,
        registrationType: "team",
        requiredPlayers: 7,
        maxSubstitutes: 3,
        registrationFee: 600,
      },
      {
        id: "sport-chess-girls",
        dayId: "day-1",
        category: "Sports - Girls",
        name: "Chess (Girls)",
        description:
          "All-girls Chess. Head-to-head individual matches on the 64 squares — outwit your opponent and checkmate.",
        registrationOpen: true,
        registrationType: "individual",
        requiredPlayers: 1,
        maxSubstitutes: 0,
        registrationFee: 75,
      },
      {
        id: "sport-carrom-girls",
        dayId: "day-1",
        category: "Sports - Girls",
        name: "Carrom (Girls)",
        description:
          "All-girls Carrom. Strike, pocket and sink your coins — enter solo or as a 2-player pair.",
        registrationOpen: true,
        registrationType: "solo_team",
        requiredPlayers: 2,
        maxSubstitutes: 0,
        registrationFee: 75,
      },
    ],
  },
  {
    id: "day-2",
    label: "Day 2",
    name: "Technical and Non-Technical",
    date: "6 October",
    description:
      "A day dedicated to technical excellence and creativity. Show your skills in technical events or perform on the biggest stage with our non-technical events.",
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
    { time: "09:00", title: "Registration", note: "Check-in at the event venues." },
    { time: "10:00", title: "Opening session", note: "Welcome and event briefing." },
    { time: "10:30", title: "Events begin", note: "Technical and Non-technical events commence." },
    { time: "13:00", title: "Break", note: "Lunch break." },
    { time: "14:00", title: "Events continue", note: "Remaining rounds and performances." },
    { time: "17:00", title: "Results and closing", note: "Prize distribution and grand finale." },
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
      "Team events: every participant registers individually online before the event. Teams assemble at the venue on event day, so a 4-player team means all 4 members register separately and team up at the venue.",
      "Each event has its own specific rules available on the event detail page.",
      "No electronic devices, AI tools, or internet access unless explicitly permitted by the event.",
    ],
  },
  {
    id: "non-technical",
    title: "Non-technical event rules",
    items: [
      "Non-technical events are held on Day 2.",
      "Events: Ramp Walk, Solo/Group Dance, TuneTopia, Treasure Hunt, Mobile Gaming (BGMI/FreeFire), Adaptune, Singing (Solo/Group), Connexion.",
      "Team events: every participant registers individually online before the event. Teams assemble at the venue on event day, so a 4-player team means all 4 members register separately and team up at the venue.",
      "Each event has its own specific rules available on the event detail page.",
      "Participants must register before the deadline.",
      "Participants must follow the instructions given by the event coordinators.",
      "No mobile phones or outside assistance during the rounds, unless permitted by the organizers.",
      "Any form of cheating may lead to disqualification.",
      "The organizers' decision will be final.",
    ],
  },
];

